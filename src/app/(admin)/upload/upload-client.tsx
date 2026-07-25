'use client';

/**
 * Upload UI — drag/drop XLSX files, auto-detect type/brand/date, queue for review,
 * then process each file (parse → validate → confirm overwrite if needed → upsert).
 *
 * Architecture:
 *   - All XLSX parsing happens in the browser via SheetJS (xlsx) — keeps server
 *     routes lean and avoids 10MB+ multipart uploads.
 *   - Records are POSTed as JSON to /api/upload/run for the actual upsert (with
 *     admin client server-side, bypassing RLS).
 *   - Existing-data check is /api/upload/check?table=&brand=&date=
 *   - Editable per-file before processing: brand, date, type — in case
 *     filename detection got something wrong.
 *   - Queue-time header sniff (type-sniff.ts) is the BACKSTOP for the type,
 *     not the primary signal. TikTok merged the Video List export into the
 *     Video Data schema (~2026-07-13) while keeping the *_Video_List_*.xlsx
 *     filename, so detectFileType maps that filename straight to Video Data.
 *     The sniff still runs, and still switches a file back to Video List for
 *     the brands whose exports have not been merged yet.
 *
 * Expected daily set: THREE files per brand — Creator Data, Video List (which
 * carries Video Data content), Transaction Analysis. The separate
 * *_Video_Data_*.xlsx export is retired; it was byte-identical to Video List.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Trash2, Upload,
  ChevronDown, ChevronUp, AlertTriangle, ArrowLeftRight,
} from 'lucide-react';
import { FreshnessPanel } from '@/components/upload/freshness-panel';
import { Badge } from '@/components/ui/badge';
import { DataMatrix } from '@/components/upload/data-matrix';
import { UploadHistory } from '@/components/upload/upload-history';
import { cn } from '@/lib/utils';

// File size limits — XLSX is parsed in-browser, so genuinely huge files
// will OOM the tab. The reject ceiling is conservative.
const FILE_SIZE_WARN_BYTES   =  50 * 1024 * 1024;   //  50 MB warn
const FILE_SIZE_REJECT_BYTES = 200 * 1024 * 1024;   // 200 MB hard reject
const QUEUE_LOCALSTORAGE_KEY = 'tempo:upload-queue:v1';
import {
  detectFileType,
  extractBrand,
  extractDate,
  validateReportDate,
  FILE_TYPE_LABELS,
  EXPECTED_DAILY_FILES,
  type FileType,
} from '@/lib/upload/file-detection';
import {
  parseCreatorRows,
  parseVideoRows,
  parseVideoListRows,
  parseProductRows,
} from '@/lib/upload/parse-rows';
import { COLUMN_MAPS, auditColumnMatches, type UploadTable as MapTable } from '@/lib/upload/column-maps';
import { extractHeaderRow, resolveTypeFromHeaders } from '@/lib/upload/type-sniff';
import {
  validateCreatorRecords,
  validateVideoRecords,
  validateProductRecords,
} from '@/lib/upload/validators';

type QueueStatus = 'queued' | 'processing' | 'success' | 'error' | 'cancelled';

interface QueueItem {
  id: string;
  file: File;
  filename: string;
  type: FileType;
  brand: string;
  reportDate: string;
  status: QueueStatus;
  log: { level: 'info' | 'warning' | 'error' | 'success'; message: string }[];
  result?: { rowCount: number; totalGmv: number; totalOrders: number };
  expanded: boolean;
  /** Existing rows for (table, brand, date), resolved at QUEUE time so the
   *  overwrite decision happens on the row, not as a mid-batch confirm().
   *  undefined = not checked yet · null = check in flight · number = known. */
  existingCount?: number | null;
  /** Row-level overwrite toggle (defaults on). Only meaningful when
   *  existingCount > 0: on = delete-then-insert, off = merge-upsert. */
  overwriteOk?: boolean;
  /** Queue-time header-sniff verdict (auto-switch or ambiguity chip). Derived
   *  from the file content each time it's added — deliberately NOT persisted
   *  (persistQueue stays metadata-only; no sniffed headers/rows in storage). */
  typeNotice?: { level: 'info' | 'warning'; message: string };
}

/** The DB table a file type writes to — used for the queue-time existing-data
 *  check. 'videos' has no report_date, so it never needs the check. */
const TABLE_FOR_TYPE: Record<FileType, string | null> = {
  creator: 'creator_performance',
  video: 'video_performance',
  videolist: null, // 'videos' — keyed (video_id, brand); overwrite doesn't apply
  affiliateproduct: 'product_performance',
  product: null,
  unknown: null,
};

// The three daily types come first. 'videolist' stays selectable but is no
// longer part of the expected set: it only applies to the pre-merge Video List
// layout, which a few brands still export and the header sniff still detects.
const FILE_TYPE_OPTIONS: { value: FileType; label: string }[] = [
  { value: 'creator',          label: 'Creator Data' },
  { value: 'video',            label: 'Video Data (incl. files named Video List)' },
  { value: 'affiliateproduct', label: 'Transaction Analysis (Products)' },
  { value: 'videolist',        label: 'Video List — pre-merge layout only' },
  { value: 'unknown',          label: 'Unknown — pick one' },
];

function newId() { return Math.random().toString(36).slice(2, 10); }

/** sha256 hex via WebCrypto — the file-grain idempotency hash sent on every
 *  chunk so the server can recognize a whole-file duplicate. */
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

interface ActiveBrand {
  slug: string;
  name: string;
}

interface UploadClientProps {
  activeBrands: ActiveBrand[];
}

// Survives a browser refresh — we persist the metadata of unfinished items
// (filename, brand, date, type, status, log) but NOT the File object itself
// (Files can't be serialized). On reload, the user sees a banner with what
// was unfinished so they can re-drop those files. Better than silently
// losing the queue state.
interface PersistedQueueItem {
  id: string;
  filename: string;
  type: FileType;
  brand: string;
  reportDate: string;
  status: QueueStatus;
  log: { level: 'info' | 'warning' | 'error' | 'success'; message: string }[];
  result?: { rowCount: number; totalGmv: number; totalOrders: number };
}

function persistQueue(queue: QueueItem[]) {
  try {
    const meta: PersistedQueueItem[] = queue.map(({ id, filename, type, brand, reportDate, status, log, result }) => ({
      id, filename, type, brand, reportDate, status, log, result,
    }));
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(QUEUE_LOCALSTORAGE_KEY, JSON.stringify(meta));
    }
  } catch {
    // localStorage may be full or disabled — ignore
  }
}

function loadPersistedQueue(): PersistedQueueItem[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(QUEUE_LOCALSTORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersistedQueueItem[];
    // Only restore unfinished items — successful uploads don't need to come back
    return parsed.filter(p => p.status === 'queued' || p.status === 'processing' || p.status === 'error');
  } catch {
    return [];
  }
}

export function UploadClient({ activeBrands }: UploadClientProps) {
  const brandLabelBySlug = useMemo(
    () => new Map(activeBrands.map(b => [b.slug, b.name])),
    [activeBrands],
  );

  const [queue, setQueue] = useState<QueueItem[]>([]);
  // Always-current snapshot for async workers (processAll's pool + the
  // queue-time existing checks read latest state, not a stale closure).
  const queueRef = useRef<QueueItem[]>([]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  const [dragActive, setDragActive] = useState(false);
  const [running, setRunning] = useState(false);
  // Ref mirrors/registries for async workers (closure state goes stale):
  // - runningRef: header sniffs must never re-type an item while a run is
  //   active — a late switch would bypass the run's same-key serialization.
  // - sniffInFlightRef: processAll awaits these before snapshotting its
  //   serialization groups, so no sniff can land between snapshot and pickup.
  // - writtenKeysRef: (type|brand|date) keys successfully written this
  //   session — a later same-key item's queue-time existingCount is stale and
  //   must be re-checked inline so its Overwrite toggle takes real effect.
  const runningRef = useRef(false);
  const sniffInFlightRef = useRef<Map<string, Promise<void>>>(new Map());
  const writtenKeysRef = useRef<Set<string>>(new Set());
  // Recovery banner: items the user had queued before refresh, surfaced so
  // they can re-drop the files (we can't rehydrate File objects).
  const [unrecoveredItems, setUnrecoveredItems] = useState<PersistedQueueItem[]>([]);
  // Bumped each time a file uploads successfully — causes Freshness, Matrix,
  // and History panels to refetch so what just landed shows up immediately.
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Restore persisted unfinished items on mount
  useEffect(() => {
    const persisted = loadPersistedQueue();
    if (persisted.length > 0) {
      setUnrecoveredItems(persisted);
      // Clear so the banner doesn't reappear on next refresh — user has been notified
      try { window.localStorage.removeItem(QUEUE_LOCALSTORAGE_KEY); } catch {}
    }
  }, []);

  // ── Persist queue on every change (so a refresh during upload doesn't lose state)
  useEffect(() => {
    persistQueue(queue);
  }, [queue]);

  // ── Drag/drop handlers
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
  }, []);
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);
  const onDragLeave = useCallback(() => setDragActive(false), []);

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    addFiles(files);
    e.target.value = '';
  }, []);

  function addFiles(files: File[]) {
    const xlsxFiles = files.filter(f => /\.(xlsx|xls)$/i.test(f.name));
    if (xlsxFiles.length === 0) return;

    const items: QueueItem[] = [];
    for (const f of xlsxFiles) {
      const item: QueueItem = {
        id: newId(),
        file: f,
        filename: f.name,
        type: detectFileType(f.name),
        brand: extractBrand(f.name, activeBrands),
        reportDate: extractDate(f.name),
        status: 'queued',
        log: [],
        expanded: false,
      };

      // ── File size hard-cap. SheetJS reads the entire file into memory
      // in the browser; oversized files crash the tab.
      if (f.size > FILE_SIZE_REJECT_BYTES) {
        item.status = 'error';
        item.expanded = true;
        item.log.push({
          level: 'error',
          message: `File is ${(f.size / 1024 / 1024).toFixed(1)} MB — too large to parse in-browser. Hard cap is ${FILE_SIZE_REJECT_BYTES / 1024 / 1024} MB. Split the file or reach out for streaming support.`,
        });
      } else if (f.size > FILE_SIZE_WARN_BYTES) {
        item.log.push({
          level: 'warning',
          message: `Large file (${(f.size / 1024 / 1024).toFixed(1)} MB) — parsing may be slow. Consider splitting if it stalls.`,
        });
      }

      items.push(item);
    }

    setQueue(q => [...q, ...items]);
    // Eager ref sync (same as updateItem): the sniff below reads queueRef as
    // soon as the header parse finishes, which can beat the passive effect
    // that mirrors committed state into the ref.
    queueRef.current = [...queueRef.current, ...items];
    // Resolve the overwrite chips up front — by the time the user hits
    // "Upload all", every row already knows whether it replaces existing data.
    // The header sniff runs alongside and may switch the type (re-issuing the
    // check for the new table). Size-rejected files (status 'error') skip both.
    for (const it of items) {
      if (it.status !== 'error') {
        void runExistingCheck(it.id, it.type, it.brand, it.reportDate);
        // Tracked so processAll can await every in-flight sniff BEFORE it
        // snapshots the serialization groups.
        const sniff = sniffTypeFromHeaders(it.id, it.file)
          .catch(() => { /* sniff is best-effort — run-time audit is the backstop */ })
          .finally(() => { sniffInFlightRef.current.delete(it.id); });
        sniffInFlightRef.current.set(it.id, sniff);
      }
    }
  }

  function updateItem(id: string, patch: Partial<QueueItem>) {
    // Eagerly mirror the patch into queueRef so async workers reading the ref
    // immediately after an update see it — the sniff's auto-switch updates the
    // type and then re-issues the existing-data check, whose stale-response
    // guard compares item.type; the ref must already carry the new type when
    // that response lands. The commit effect re-syncs the ref right after.
    queueRef.current = queueRef.current.map(i => i.id === id ? { ...i, ...patch } : i);
    setQueue(q => q.map(i => i.id === id ? { ...i, ...patch } : i));
  }

  /** Queue-time existing-data check — resolves the overwrite question on the
   *  ROW (chip + toggle) instead of a mid-batch window.confirm() per file
   *  (14-file daily runs meant up to 14 modal interrupts). Re-runs whenever
   *  type/brand/date change. Failure leaves existingCount undefined and
   *  processItem re-checks inline without prompting. */
  async function runExistingCheck(id: string, type: FileType, brand: string, reportDate: string) {
    const table = TABLE_FOR_TYPE[type];
    if (!table || !brand || brand === 'unknown' || !reportDate) {
      updateItem(id, { existingCount: undefined });
      return;
    }
    updateItem(id, { existingCount: null }); // in flight
    try {
      const url = `/api/upload/check?table=${encodeURIComponent(table)}&brand=${encodeURIComponent(brand)}&date=${encodeURIComponent(reportDate)}`;
      const res = await fetch(url);
      const j = await res.json();
      // Ignore stale responses: only apply if the row still matches the inputs.
      const current = queueRef.current.find(i => i.id === id);
      if (!current || current.type !== type || current.brand !== brand || current.reportDate !== reportDate) return;
      updateItem(id, { existingCount: res.ok ? Number(j.existingCount) || 0 : undefined });
    } catch {
      updateItem(id, { existingCount: undefined });
    }
  }

  /** Queue-time content-based type resolution — the BACKSTOP behind
   *  detectFileType, which now maps *_Video_List_*.xlsx straight to Video Data
   *  (TikTok merged the schemas ~2026-07-13). It still earns its keep in the
   *  other direction: brands whose exports have not been merged yet ship the
   *  pre-merge Video List layout under the same filename, and the header row
   *  is the only thing that can tell them apart. Read ONLY the header row and
   *  let the columns decide. The Type dropdown stays editable — this is a
   *  default, not a lock. Sniffed headers stay local to this function: nothing
   *  raw may land on the QueueItem (the queue persists to localStorage). */
  async function sniffTypeFromHeaders(id: string, file: File) {
    if (runningRef.current) return; // never re-type items during a run
    let headerRow: Record<string, unknown> | null = null;
    try {
      const ab = await file.arrayBuffer();
      headerRow = extractHeaderRow(ab);
    } catch {
      return; // unreadable — the full run-time parse will surface the real error
    }
    if (!headerRow) return; // header-only/empty sheet: leave the type unchanged

    // Decide against the item's CURRENT type — the user may have touched the
    // dropdown (or removed the row) while the file was being read.
    const current = queueRef.current.find(i => i.id === id);
    if (!current || current.status !== 'queued') return;
    // A run may have started while we were reading the file. A late switch
    // would re-key this item AROUND the run's same-key serialization snapshot,
    // so leave the type (and the chip) alone — better unlabeled than
    // mislabeled; the run-time cross-audit stays the backstop.
    if (runningRef.current) return;
    const decision = resolveTypeFromHeaders(headerRow, current.type);
    if (decision.action === 'none') return;

    if (decision.action === 'ambiguous') {
      updateItem(id, {
        typeNotice: {
          level: 'warning',
          message: `Ambiguous file: columns match both ${FILE_TYPE_LABELS[decision.chosen.type]} (${decision.chosen.matched}/${decision.chosen.total}) and ${FILE_TYPE_LABELS[decision.best.type]} (${decision.best.matched}/${decision.best.total}) — kept ${FILE_TYPE_LABELS[decision.chosen.type]}; verify the Type dropdown before uploading.`,
        },
      });
      return;
    }

    const vsChosen = decision.chosen ? ` vs ${decision.chosen.matched}/${decision.chosen.total}` : '';
    // Type + chip land in ONE update, and updateItem mirrors the patch into
    // queueRef synchronously — so the existing-data check issued next (for the
    // NEW type's table) can't have its response dropped by the stale guard,
    // which compares item.type.
    updateItem(id, {
      type: decision.to,
      typeNotice: {
        level: 'info',
        message: `Type auto-switched: ${FILE_TYPE_LABELS[current.type]} → ${FILE_TYPE_LABELS[decision.to]} — columns matched ${decision.best.matched}/${decision.best.total}${vsChosen}`,
      },
    });
    const fresh = queueRef.current.find(i => i.id === id);
    void runExistingCheck(id, decision.to, fresh?.brand ?? current.brand, fresh?.reportDate ?? current.reportDate);
  }

  /** QueueRow's onChange — patches the item and re-resolves the overwrite
   *  chip when any of the check inputs changed. */
  function patchItem(id: string, patch: Partial<QueueItem>) {
    // A manual Type change supersedes the sniff's verdict — drop its chip so a
    // stale "auto-switched" message can't describe a type the user overrode.
    const effective: Partial<QueueItem> = 'type' in patch ? { ...patch, typeNotice: undefined } : patch;
    updateItem(id, effective);
    if ('type' in patch || 'brand' in patch || 'reportDate' in patch) {
      const it = queueRef.current.find(i => i.id === id);
      const next = { ...it, ...effective } as QueueItem;
      void runExistingCheck(id, next.type, next.brand, next.reportDate);
    }
  }

  function removeItem(id: string) {
    // Eager ref sync (same as updateItem) — a run's item pickup reads queueRef,
    // and a just-removed row must never be picked up and uploaded anyway.
    queueRef.current = queueRef.current.filter(i => i.id !== id);
    setQueue(q => q.filter(i => i.id !== id));
  }

  function clearQueue() {
    queueRef.current = queueRef.current.filter(i => i.status === 'processing');
    setQueue(q => q.filter(i => i.status === 'processing'));
  }

  function appendLog(id: string, level: QueueItem['log'][number]['level'], message: string) {
    setQueue(q => q.map(i => i.id === id ? { ...i, log: [...i.log, { level, message }] } : i));
  }

  // ── Per-item processing
  async function processItem(item: QueueItem) {
    updateItem(item.id, { status: 'processing', log: [], expanded: true });

    // Skip items already marked errored on add (e.g. file size cap)
    if (item.status === 'error' && item.log.length > 0) {
      return;
    }

    // 1. Validate report date — this is the file-level guard. The file's
    //    label says it's for date X; if X is in the future, hard-block here
    //    before we even try to parse rows. Per-row dates inside the file are
    //    handled by the parser/validators downstream.
    //    Dated tables hard-require a real date FIRST: a header-sniff switch
    //    into a dated type (video_performance rows carry report_date; the
    //    videos table doesn't) turns an undated upload into a dated one, and
    //    validateReportDate would silently pass ''.
    if (TABLE_FOR_TYPE[item.type] !== null && !/^\d{4}-\d{2}-\d{2}$/.test(item.reportDate)) {
      appendLog(item.id, 'error', `Report date is required for ${FILE_TYPE_LABELS[item.type]} uploads — set the date field above and retry.`);
      updateItem(item.id, { status: 'error' });
      return;
    }
    const dateCheck = validateReportDate(item.reportDate);
    if (!dateCheck.valid) {
      appendLog(item.id, 'error', dateCheck.error || 'Invalid date');
      updateItem(item.id, { status: 'error' });
      return;
    }
    if (dateCheck.warning) appendLog(item.id, 'warning', dateCheck.warning);

    // File-level future-date guard. validateReportDate accepts today/yesterday
    // but anything explicitly in the future means the filename was wrong or
    // someone re-uploaded an export from before a clock skew. Refuse.
    {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const fileDate = new Date(item.reportDate + 'T12:00:00Z');
      if (fileDate.getTime() > today.getTime()) {
        appendLog(item.id, 'error',
          `Report date ${item.reportDate} is in the future. Edit the date field above to a real upload date and retry.`);
        updateItem(item.id, { status: 'error' });
        return;
      }
    }

    // 2. Validate brand
    if (item.brand === 'unknown') {
      appendLog(item.id, 'error', 'Brand not detected — pick a brand from the dropdown above and retry.');
      updateItem(item.id, { status: 'error' });
      return;
    }
    if (item.type === 'unknown') {
      appendLog(item.id, 'error', 'File type not detected — pick a type from the dropdown above and retry.');
      updateItem(item.id, { status: 'error' });
      return;
    }

    // Never let an unresolved brand reach the API — rows written under a junk
    // brand slug are invisible to every surface (the worst kind of "success").
    if (!item.brand || item.brand === 'unknown' || !brandLabelBySlug.has(item.brand)) {
      appendLog(item.id, 'error', 'Brand not detected — pick the brand from the dropdown above and retry.');
      updateItem(item.id, { status: 'error' });
      return;
    }

    appendLog(item.id, 'info', `Reading ${item.filename}...`);

    // 3. Parse XLSX in browser
    let rows: Record<string, unknown>[];
    try {
      const ab = await item.file.arrayBuffer();
      const workbook = XLSX.read(ab, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'XLSX parse failed';
      appendLog(item.id, 'error', `XLSX parse failed: ${message}`);
      updateItem(item.id, { status: 'error' });
      return;
    }

    if (rows.length === 0) {
      appendLog(item.id, 'error', 'File appears to be empty.');
      updateItem(item.id, { status: 'error' });
      return;
    }

    appendLog(item.id, 'info', `Parsed ${rows.length.toLocaleString()} rows.`);

    // Capture the raw file headers up front — used to enrich error messages
    // when the parser/validator finds something off (e.g. "we expected
    // 'Creator-attributed GMV' but didn't find it; here's what we DID see").
    const fileColumns = Object.keys(rows[0] ?? {});

    // 4. Map type → table + parser
    const { table, parsed, errors, warnings, totalGmv, totalOrders } = await runTypeParser(item, rows);
    if (!table) {
      // already logged
      updateItem(item.id, { status: 'error' });
      return;
    }

    appendLog(
      item.id, 'info',
      `Matched ${parsed.matchedColumns.length}/${parsed.totalCols} columns: ${parsed.matchedColumns.join(', ')}`
    );
    if (parsed.missingColumns.length > 0 && parsed.missingColumns.length <= 4) {
      appendLog(item.id, 'warning', `Missing (will default to 0): ${parsed.missingColumns.join(', ')}`);
    }

    // Schema-mismatch warning: file has columns we don't know how to handle.
    // Could mean TikTok added new fields we should be capturing — surfaces
    // the discovery early instead of silently dropping the data.
    if (parsed.matchedColumns.length > 0) {
      const matchedHeaderTokens = new Set(parsed.matchedColumns.map(c => c.toLowerCase()));
      const unmappedFileCols = fileColumns.filter(h => {
        // Heuristic: if the raw header doesn't loosely contain any matched token, flag it
        const hl = h.toLowerCase();
        return !Array.from(matchedHeaderTokens).some(t => hl.includes(t.replace(/_/g, ' ')) || hl.replace(/[^a-z]/g, '').includes(t.replace(/_/g, '')));
      });
      if (unmappedFileCols.length > 0 && unmappedFileCols.length <= 6) {
        appendLog(item.id, 'info', `File has ${unmappedFileCols.length} unmapped column(s): ${unmappedFileCols.join(', ')} — ignored, but worth checking if any are new TikTok fields we should capture.`);
      }
    }

    if (parsed.records.length === 0) {
      // Cross-audit the headers against every OTHER upload type's map. A file
      // fed into the wrong type matches almost nothing on the chosen map but
      // nearly everything on the right one — say so instead of the generic
      // "check the format". Still reachable after the filename fix: a brand on
      // the pre-merge Video List layout whose sniff was skipped lands here.
      const TYPE_LABELS: Record<MapTable, string> = {
        creator_performance: 'Creator Data',
        video_performance: 'Video Data',
        videos: 'Video List',
        product_performance: 'Affiliate Product',
      };
      let best: { t: MapTable; matched: number; total: number } | null = null;
      for (const t of Object.keys(COLUMN_MAPS) as MapTable[]) {
        if (t === table) continue;
        const a = auditColumnMatches(rows[0], t);
        const total = a.matched.length + a.missing.length;
        if (total > 0 && (!best || a.matched.length / total > best.matched / best.total)) {
          best = { t, matched: a.matched.length, total };
        }
      }
      const chosenRatio = parsed.totalCols > 0 ? parsed.matchedColumns.length / parsed.totalCols : 0;
      if (best && best.matched / best.total >= 0.7 && best.matched / best.total > chosenRatio) {
        appendLog(
          item.id, 'error',
          `No valid records — this file's columns match the ${TYPE_LABELS[best.t]} format (${best.matched}/${best.total} columns), not ${TYPE_LABELS[table]} (${parsed.matchedColumns.length}/${parsed.totalCols}). Switch the Type dropdown to ${TYPE_LABELS[best.t]} and retry.`,
        );
      } else {
        appendLog(item.id, 'error', `No valid records after parsing. Check that columns match TikTok's export format.`);
      }
      updateItem(item.id, { status: 'error' });
      return;
    }

    // 5. Surface validation
    for (const w of warnings.slice(0, 5)) appendLog(item.id, 'warning', w);
    if (warnings.length > 5) appendLog(item.id, 'warning', `...and ${warnings.length - 5} more warnings.`);
    if (errors.length > 0) {
      for (const e of errors) appendLog(item.id, 'error', e);

      // If any error mentions a column-mapping failure (BLOCKED / GMV-zero
      // signature), dump the raw file column headers so the user can
      // immediately spot what TikTok renamed. This was the pattern that
      // burned us on Apr 30 — adding it directly to the error makes
      // debugging a 10-second job instead of a 5-minute file inspection.
      const hasMappingError = errors.some(e =>
        e.includes('BLOCKED') || e.includes('GMV column') || e.includes('column wasn\'t found')
      );
      if (hasMappingError && fileColumns.length > 0) {
        appendLog(
          item.id, 'error',
          `Columns found in your file: ${fileColumns.join(', ')}`
        );
      }

      updateItem(item.id, { status: 'error' });
      return;
    }

    // 6. Overwrite decision — resolved at QUEUE time (the chip + toggle on the
    // row), so "Upload all" runs unattended: no window.confirm() per file
    // (a 14-file daily batch used to mean up to 14 modal interrupts mid-run).
    // If the queue-time check never completed (network), re-check inline once,
    // still without prompting — the row's toggle (default on) is the decision.
    let overwrite = false;
    if (table !== 'videos') {
      let count = item.existingCount;
      // The queue-time count goes stale the moment another file writes the
      // same (type|brand|date) in this session: on an empty backfill day both
      // files of a duplicate-target pair resolve 0 at queue time, so the
      // second would run overwrite=false and MERGE-union on top of the first,
      // inflating GMV while its chip promised replacement. Re-check inline
      // when this key was already written this session, or when a 0-count item
      // has a same-key peer in the queue (the peer may write before we run —
      // same-key items execute strictly serialized, so the re-check sees its
      // committed rows).
      const itemKey = `${item.type}|${item.brand}|${item.reportDate}`;
      const hasSameKeyPeer = queueRef.current.some(i =>
        i.id !== item.id && i.status !== 'error' && i.status !== 'cancelled' &&
        `${i.type}|${i.brand}|${i.reportDate}` === itemKey,
      );
      const countIsStale = writtenKeysRef.current.has(itemKey) || (count === 0 && hasSameKeyPeer);
      if (count == null || countIsStale) {
        try {
          const url = `/api/upload/check?table=${encodeURIComponent(table)}&brand=${encodeURIComponent(item.brand)}&date=${encodeURIComponent(item.reportDate)}`;
          const res = await fetch(url);
          const j = await res.json();
          if (res.ok) count = Number(j.existingCount) || 0;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'check failed';
          appendLog(item.id, 'warning', `Existing-data check failed (${message}) — proceeding as a merge (no delete).`);
        }
      }
      if ((count ?? 0) > 0) {
        if (item.overwriteOk !== false) {
          overwrite = true;
          appendLog(item.id, 'info', `Overwriting ${count!.toLocaleString()} existing rows for ${brandLabelBySlug.get(item.brand) ?? item.brand} on ${item.reportDate}.`);
        } else {
          appendLog(item.id, 'info', `Keeping ${count!.toLocaleString()} existing rows — merging on top (no delete), per the row's toggle.`);
        }
      }
    }

    // 7. Upsert via server route
    //
    // Vercel caps request bodies at ~4.5 MB. Chunking by ROW COUNT alone
    // (formerly CHUNK_SIZE=5000) kept failing whenever rows got wider — COSRX
    // Creator Data at 42k rows first, then LeeFar US Video Data (long captions
    // + links pushed 5,000 rows past the cap). So chunk by SERIALIZED SIZE:
    // accumulate rows until the measured payload reaches CHUNK_TARGET_BYTES
    // (a wide margin under the platform cap — captions are emoji-heavy, and
    // the envelope adds overhead), with a row-count ceiling as a secondary cap.
    //
    // Chunking is safe across all tables:
    //   - videos (video-list): the RPC is pure upsert on (video_id, brand),
    //     each chunk is an independent idempotent write.
    //   - creator/video/product performance: the RPCs are delete-then-insert
    //     when p_overwrite=true. To preserve that semantic across chunks we
    //     send p_overwrite=<user_choice> on the FIRST chunk (which does the
    //     DELETE), and p_overwrite=false on every subsequent chunk (pure
    //     INSERT ... ON CONFLICT DO UPDATE, no re-delete). The final DB
    //     state is: all rows from all chunks, previous data cleared exactly
    //     once. Trade-off: if the run fails mid-chunks, the state is partial
    //     until the user retries — a fresh retry with overwrite=true fully
    //     heals it because the first chunk deletes the partial rows.
    const CHUNK_TARGET_BYTES = 3 * 1024 * 1024; // ~3 MB payload target
    const CHUNK_MAX_ROWS = 5000;
    const encoder = new TextEncoder(); // byte-accurate: emoji captions are 2-4 bytes/char
    const chunks: unknown[][] = [];
    {
      let cur: unknown[] = [];
      let curBytes = 0;
      for (const rec of parsed.records) {
        const recBytes = encoder.encode(JSON.stringify(rec)).length + 1;
        if (cur.length > 0 && (curBytes + recBytes > CHUNK_TARGET_BYTES || cur.length >= CHUNK_MAX_ROWS)) {
          chunks.push(cur);
          cur = [];
          curBytes = 0;
        }
        cur.push(rec);
        curBytes += recBytes;
      }
      // Always send at least one request (even for an empty parse) so a
      // confirmed overwrite still clears the existing day, as it always did.
      if (cur.length > 0 || chunks.length === 0) chunks.push(cur);
    }

    if (chunks.length > 1) {
      appendLog(item.id, 'info', `Uploading ${parsed.records.length.toLocaleString()} rows to ${table} in ${chunks.length} chunks (max ${CHUNK_MAX_ROWS.toLocaleString()} rows / ~${Math.round(CHUNK_TARGET_BYTES / 1024 / 1024)} MB each)...`);
    } else {
      appendLog(item.id, 'info', `Uploading ${parsed.records.length.toLocaleString()} rows to ${table}...`);
    }

    // ── File-grain protocol: every chunk carries the identity of the WHOLE
    // file (hash + totals + position) so the server can run idempotency and
    // the $0-GMV guard at FILE grain instead of chunk grain — per-chunk
    // idempotency and per-chunk GMV guards were stranding files mid-upload.
    // The hash mirrors the server's existing hash-input shape
    // ({ table, brand, reportDate, records }) but over ALL parsed records,
    // so the value is stable across retries of the same file.
    const fileTotals = { gmv: totalGmv, orders: totalOrders, rows: parsed.records.length };
    const fileHash = await sha256Hex(
      JSON.stringify({ table, brand: item.brand, reportDate: item.reportDate, records: parsed.records }),
    );

    try {
      let totalUpserted = 0;
      let totalDroppedFuture = 0;
      // Chunks are STRICTLY SEQUENTIAL with abort-on-first-failure — the
      // server's record-hash-on-final-chunk invariant depends on ordering, so
      // intra-file parallelism is forbidden here.
      let idempotentSkipMessage: string | null = null;
      const registryWarnings: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        // Only the first chunk carries the user's overwrite decision. If
        // subsequent chunks re-sent overwrite=true, each would re-DELETE
        // everything the earlier chunks just inserted.
        const chunkOverwrite = i === 0 ? overwrite : false;
        const res = await fetch('/api/upload/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table,
            brand: item.brand,
            reportDate: item.reportDate,
            records: chunk,
            overwrite: chunkOverwrite,
            // File-grain fields — the server treats all of these as optional.
            fileHash,
            chunkIndex: i,
            chunkCount: chunks.length,
            fileTotals,
          }),
        });
        // Body-too-large surfaces as a non-JSON plain-text response from the
        // platform (not our route) — read as text first and surface clearly
        // instead of dying on JSON.parse.
        const text = await res.text();
        let j: {
          error?: string; upserted?: number; idempotent?: boolean; skipRemaining?: boolean;
          message?: string; droppedFutureRows?: number;
          // video_performance uploads maintain the videos registry as a side
          // effect — a failed registry upsert arrives as a warning, NOT an error.
          registryWarning?: string; registryUpserts?: number;
        };
        try {
          j = JSON.parse(text);
        } catch {
          throw new Error(
            res.status === 413
              ? `Chunk ${i + 1}/${chunks.length} rejected as too large (${chunk.length.toLocaleString()} rows) even after size-based chunking (~${Math.round(CHUNK_TARGET_BYTES / 1024 / 1024)} MB target). A single row may exceed the platform body cap — file a bug.`
              : `HTTP ${res.status}: ${text.slice(0, 200)}`
          );
        }
        // Server errors (including the file-grain BLOCKED mapping-failure
        // response) surface VERBATIM — the message now carries operator
        // guidance, and the row's inline error renders it as-is.
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        if (j.idempotent && j.skipRemaining) {
          // File-grain no-op: the server recognized the WHOLE file as already
          // processed. Stop the chunk loop now — continuing would re-receive
          // the cached file-level count on every remaining chunk and multiply
          // the totals in the success log.
          idempotentSkipMessage = j.message ?? 'Identical file was already processed — no-op (idempotency).';
          break;
        }
        if (j.idempotent) {
          appendLog(item.id, 'info', j.message ?? 'Identical chunk was already processed (idempotency).');
        }
        totalUpserted += j.upserted ?? 0;
        totalDroppedFuture += j.droppedFutureRows ?? 0;
        if (j.registryWarning) registryWarnings.push(j.registryWarning);
        if (chunks.length > 1) {
          appendLog(item.id, 'info', `Chunk ${i + 1}/${chunks.length}: ${(j.upserted ?? 0).toLocaleString()} rows upserted.`);
        }
      }

      // Registry warnings surface like droppedFutureRows: the performance rows
      // DID land so the item stays success-with-warning, but a silent registry
      // failure is exactly how the registry went dark before — the operator
      // must see it in the row log. Logged outside the skip branch so a
      // mid-file idempotent skip can't swallow warnings from earlier chunks.
      for (const w of [...new Set(registryWarnings)]) {
        appendLog(item.id, 'warning', w);
      }

      if (idempotentSkipMessage) {
        // Skipped chunks contribute NO per-chunk counts — the server's no-op
        // message is the whole story for this file.
        appendLog(item.id, 'success', idempotentSkipMessage);
      } else {
        if (totalDroppedFuture > 0) {
          appendLog(
            item.id, 'warning',
            `${totalDroppedFuture.toLocaleString()} row(s) skipped: future post date (scheduled, not-yet-published videos). Each will import automatically from a later export once it publishes.`
          );
        }
        appendLog(
          item.id, 'success',
          `${totalUpserted.toLocaleString()} rows upserted. Total GMV: $${totalGmv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, Orders: ${totalOrders.toLocaleString()}.`
        );
      }
      // Record the written key (idempotent no-ops included — the data exists
      // server-side either way) so any later same-key item re-checks existing
      // rows inline instead of trusting its stale queue-time count.
      writtenKeysRef.current.add(`${item.type}|${item.brand}|${item.reportDate}`);
      updateItem(item.id, {
        status: 'success',
        result: { rowCount: parsed.records.length, totalGmv, totalOrders },
      });
      setRefreshKey(k => k + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      appendLog(item.id, 'error', message);
      updateItem(item.id, { status: 'error' });
    }
  }

  // Process the queue with BOUNDED PARALLELISM. Files for different
  // (type, brand, date) keys are independent — the server serializes real
  // conflicts with per-key advisory locks anyway — so 3 at a time cuts a
  // 14-file daily batch's wall-clock to roughly a third. Files sharing a key
  // stay strictly sequential (chunked overwrite semantics must not interleave).
  // Items are re-read from queueRef at start so each worker sees the latest
  // row state (overwrite toggles, edits made before the click).
  const UPLOAD_CONCURRENCY = 3;
  async function processAll() {
    setRunning(true); // disables per-row edits immediately (QueueRow gates on it)
    try {
      // Let every in-flight header sniff settle BEFORE snapshotting the
      // serialization groups — a sniff landing between snapshot and pickup
      // would silently re-key an item into another group's territory (e.g. a
      // late switch onto the same table as another queued file for the same
      // day: interleaved chunk-1 overwrite DELETEs corrupt the day, and both
      // fileHashes land in the 24h idempotency table with no self-heal).
      await Promise.allSettled([...sniffInFlightRef.current.values()]);
      // From here to the end of the run, any late sniff leaves types alone
      // (sniffTypeFromHeaders checks this ref).
      runningRef.current = true;

      const ids = queueRef.current.filter(q => q.status === 'queued').map(q => q.id);
      const groups = new Map<string, string[]>();
      for (const id of ids) {
        const it = queueRef.current.find(i => i.id === id);
        if (!it) continue;
        const key = `${it.type}|${it.brand}|${it.reportDate}`;
        const g = groups.get(key);
        if (g) g.push(id);
        else groups.set(key, [id]);
      }
      const groupList = [...groups.values()];

      // LIVE same-key serialization, belt to the snapshot's braces: the key is
      // recomputed from CURRENT item state at pickup and execution is routed
      // through a per-key promise chain, so two items resolving to the same
      // (type|brand|date) can never overlap — regardless of where a type
      // change came from (header sniff, dropdown edit) or when it landed.
      const keyChains = new Map<string, Promise<void>>();
      function runSerializedByKey(id: string): Promise<void> {
        const current = queueRef.current.find(i => i.id === id);
        if (!current || current.status !== 'queued') return Promise.resolve();
        const key = `${current.type}|${current.brand}|${current.reportDate}`;
        const prev = keyChains.get(key) ?? Promise.resolve();
        const run = prev.then(async () => {
          const fresh = queueRef.current.find(i => i.id === id);
          if (fresh && fresh.status === 'queued') await processItem(fresh);
        });
        keyChains.set(key, run.catch(() => { /* keep the chain alive */ }));
        return run;
      }

      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_CONCURRENCY, groupList.length) }, async () => {
          while (next < groupList.length) {
            const group = groupList[next++];
            for (const id of group) {
              await runSerializedByKey(id);
            }
          }
        }),
      );
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }

  const counts = useMemo(() => {
    const c = { queued: 0, processing: 0, success: 0, error: 0, cancelled: 0 };
    for (const i of queue) c[i.status]++;
    return c;
  }, [queue]);

  // Duplicate-target detection — two queue items can resolve to the same
  // (type|brand|date), which is exactly what happens if an operator still
  // drops both Brand_Video_List_D and the retired Brand_Video_Data_D: both
  // now type as Video Data.
  // The run pool serializes same-key items, so the SECOND one silently
  // overwrites the first — warn on the later item and let the operator decide
  // (never auto-remove). Derived from the queue so it stays correct through
  // every sniff switch and dropdown edit.
  const duplicateTargetById = useMemo(() => {
    const firstByKey = new Map<string, string>();
    const dupes = new Map<string, string>();
    for (const it of queue) {
      if (it.status === 'error' || it.status === 'cancelled') continue;
      if (it.type === 'unknown' || it.type === 'product' || !it.brand || it.brand === 'unknown') continue;
      const key = `${it.type}|${it.brand}|${it.reportDate}`;
      const first = firstByKey.get(key);
      if (first === undefined) {
        firstByKey.set(key, it.filename);
      } else if (it.status === 'queued') {
        // Copy must be true in every case: the videos table is a merge-only
        // upsert (no overwrite path), and for dated tables the later file
        // replaces the first only when its Overwrite toggle engages.
        dupes.set(it.id, it.type === 'videolist'
          ? `Same target as ${first} — the later file merges into the video registry`
          : `Same target as ${first} — the later file replaces it when its Overwrite toggle is on, otherwise merges on top`);
      }
    }
    return dupes;
  }, [queue]);

  return (
    <div className="space-y-8">
      {/* Recovery banner — shown when the last session had unfinished items.
          We can't restore the actual File handles (browsers don't permit it
          for security reasons), but we surface the metadata so the user
          knows what they were in the middle of. */}
      {unrecoveredItems.length > 0 && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/25 px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-bold text-foreground">
                {unrecoveredItems.length} unfinished upload{unrecoveredItems.length === 1 ? '' : 's'} from your last session
              </div>
              <div className="text-xs text-amber-500 mt-1">
                Browser refreshed mid-upload. Re-drop these files (we can&apos;t auto-recover
                the file content, only the metadata):
              </div>
              <ul className="mt-2 space-y-0.5 text-xs text-foreground">
                {unrecoveredItems.map(it => (
                  <li key={it.id} className="flex items-center gap-2">
                    <span className="font-medium">{it.filename}</span>
                    <span className="text-amber-500">·</span>
                    <span>{brandLabelBySlug.get(it.brand) ?? it.brand} · {it.reportDate}</span>
                    <span className="text-amber-500">·</span>
                    <span className="capitalize">{it.status}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setUnrecoveredItems([])}
                className="mt-3 text-xs font-semibold text-amber-500 hover:text-foreground"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Working row: ACT (drop + queue) beside the SIGNAL (gaps to fill).
          The Jen incident showed this page's real job is keeping every brand
          current — the gap list sits at eye level next to the dropzone so
          "what still needs uploading" is never below the fold. */}
      <div className="grid items-start gap-5 xl:grid-cols-[1.55fr_1fr]">
      {/* Drop zone + queue */}
      <div className="space-y-5">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={cn(
          'rounded-2xl border-2 border-dashed p-10 text-center transition-all',
          dragActive
            ? 'border-[var(--primary)] bg-primary/10 scale-[1.01]'
            : 'border-border bg-card shadow-[var(--pulse-elev-1)] hover:border-primary/40'
        )}
      >
        <span className="bg-pulse-grad mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl text-white shadow-pulse-primary">
          <Upload className="h-5 w-5" />
        </span>
        <p className="text-sm font-semibold text-[var(--foreground)]">Drop TikTok Shop XLSX exports here</p>
        <p className="text-xs text-muted-foreground mt-1">
          Auto-detects brand, file type, and date from names like{' '}
          <code className="text-muted-foreground">Brand_FileType_YYYYMMDD.xlsx</code>
        </p>
        {/* Named here because nothing else on the page tells the operator what
            a complete day looks like. Driven off EXPECTED_DAILY_FILES so this
            copy can't drift from the freshness dots and the gap checklist. */}
        <p className="mt-3 text-xs text-muted-foreground">
          <span className="font-semibold text-[var(--foreground)]">
            {EXPECTED_DAILY_FILES.length} files per brand, per day:
          </span>{' '}
          {EXPECTED_DAILY_FILES.map(f => f.exportLabel).join(' · ')}
        </p>
        {/* NOT "the Video Data export is retired" — that is only true for the
            brands TikTok has already migrated. Verified 2026-07-25: bondie,
            catakor and physicians_choice ship the merged layout, while jiyu,
            lemme and all three leefar stores still ship the OLD split exports,
            where Video List and Video Data are DIFFERENT reports. Telling the
            operator to drop Video Data everywhere would silently stop daily
            video performance for that half of the roster. The instruction is
            therefore "upload whatever TikTok gives you", which is correct in
            both regimes and needs no maintenance as brands migrate. */}
        <p className="mt-1 text-[11px] text-muted-foreground/80">
          For most brands Video List now carries Video Data content and one video file is enough.
          Some brands still produce both — if TikTok gives you a separate Video Data export, upload it too.
        </p>
        <label className="inline-block mt-4 px-4 py-2 rounded-xl bg-[var(--primary)] hover:brightness-[1.07] text-white text-sm font-semibold cursor-pointer transition-colors shadow-[var(--pulse-elev-1)]">
          Choose files
          <input type="file" multiple accept=".xlsx,.xls" className="hidden" onChange={onFileInput} />
        </label>
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <div className="text-sm font-semibold text-[var(--foreground)]">
              Queue · <span className="text-muted-foreground font-normal">{queue.length} file{queue.length === 1 ? '' : 's'}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-3 text-xs text-muted-foreground">
                {counts.queued > 0    && <span>{counts.queued} queued</span>}
                {counts.success > 0   && <span className="text-emerald-600">{counts.success} done</span>}
                {counts.error > 0     && <span className="text-red-500">{counts.error} failed</span>}
                {counts.cancelled > 0 && <span className="text-muted-foreground">{counts.cancelled} cancelled</span>}
              </div>
              <button
                onClick={clearQueue}
                disabled={running || counts.processing > 0}
                className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                Clear finished
              </button>
              <button
                onClick={processAll}
                disabled={running || counts.queued === 0}
                className="px-4 py-1.5 rounded-xl bg-[var(--primary)] hover:brightness-[1.07] text-white text-sm font-semibold disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {running ? 'Processing...' : `Upload ${counts.queued} file${counts.queued === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
          <ul className="divide-y divide-border">
            {queue.map(item => (
              <QueueRow
                key={item.id}
                item={item}
                brands={activeBrands}
                duplicateNotice={duplicateTargetById.get(item.id)}
                running={running}
                onChange={p => patchItem(item.id, p)}
                onRemove={() => removeItem(item.id)}
              />
            ))}
          </ul>
        </div>
      )}
      </div>

      {/* Gaps to fill — per-brand freshness, worst first (the right rail) */}
      <FreshnessPanel refreshKey={refreshKey} />
      </div>

      {/* Coverage matrix — visual "did I miss any days" check */}
      <DataMatrix refreshKey={refreshKey} />

      {/* Recent uploads — audit trail sourced from activity_log */}
      <UploadHistory refreshKey={refreshKey} />
    </div>
  );
}

// ── Queue Row ──────────────────────────────────────────────────────

function QueueRow({
  item, brands, duplicateNotice, running, onChange, onRemove,
}: {
  item: QueueItem;
  brands: ActiveBrand[];
  /** Set when another queue item resolves to the same (type|brand|date). */
  duplicateNotice?: string;
  /** True while a batch run is active. */
  running: boolean;
  onChange: (patch: Partial<QueueItem>) => void;
  onRemove: () => void;
}) {
  // Edits lock during a run: a type/brand/date change on a queued item still
  // waiting for a pool slot would re-key it around the run's same-key
  // serialization — the same race the header sniff is barred from mid-run.
  const editable = !running && (item.status === 'queued' || item.status === 'error');

  const statusConfig = {
    queued:     { Icon: FileSpreadsheet, color: 'text-muted-foreground',        bg: 'bg-muted',                    label: 'Queued',     badge: 'neutral' as const },
    processing: { Icon: Loader2,         color: 'text-[var(--primary)]',        bg: 'bg-primary/10',               label: 'Processing', badge: 'accent' as const },
    success:    { Icon: CheckCircle2,    color: 'text-[var(--pulse-pos)]',      bg: 'bg-[var(--pulse-pos-bg)]',    label: 'Done',       badge: 'positive' as const },
    error:      { Icon: AlertCircle,     color: 'text-[var(--pulse-neg)]',      bg: 'bg-[var(--pulse-neg-bg)]',    label: 'Error',      badge: 'negative' as const },
    cancelled:  { Icon: AlertTriangle,   color: 'text-muted-foreground',        bg: 'bg-muted',                    label: 'Cancelled',  badge: 'neutral' as const },
  }[item.status];

  return (
    <li className="px-5 py-3">
      <div className="flex items-start gap-3">
        <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0', statusConfig.bg)}>
          <statusConfig.Icon className={cn('h-4 w-4', statusConfig.color, item.status === 'processing' && 'animate-spin')} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm font-medium text-[var(--foreground)] truncate">{item.filename}</span>
            <Badge variant={statusConfig.badge} size="sm">{statusConfig.label}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={item.type}
              onChange={e => onChange({ type: e.target.value as FileType })}
              disabled={!editable}
              className="text-xs bg-card border border-border rounded-lg px-2 py-1.5 disabled:bg-muted disabled:text-muted-foreground"
            >
              {FILE_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              value={item.brand}
              onChange={e => onChange({ brand: e.target.value })}
              disabled={!editable}
              className={cn(
                'text-xs bg-card border rounded-lg px-2 py-1.5 disabled:bg-muted disabled:text-muted-foreground',
                item.brand === 'unknown' ? 'border-amber-300 text-amber-500' : 'border-border'
              )}
            >
              {item.brand === 'unknown' && <option value="unknown">Pick a brand…</option>}
              {brands.map(b => (
                <option key={b.slug} value={b.slug}>{b.name}</option>
              ))}
            </select>
            <input
              type="date"
              value={item.reportDate}
              onChange={e => onChange({ reportDate: e.target.value })}
              disabled={!editable}
              className="text-xs bg-card border border-border rounded-lg px-2 py-1.5 disabled:bg-muted disabled:text-muted-foreground"
            />
            {/* Header-sniff chip — auto-switch verdict or ambiguity warning.
                Chips, never popups: the queue is built for unattended batches,
                and the Type dropdown above stays editable as the override. */}
            {item.typeNotice && (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold',
                  item.typeNotice.level === 'warning'
                    ? 'border-[var(--pulse-warn)]/35 bg-[var(--pulse-warn-bg)] text-[var(--pulse-warn)]'
                    : 'border-[var(--primary)]/35 bg-primary/10 text-[var(--primary)]',
                )}
              >
                {item.typeNotice.level === 'warning'
                  ? <AlertTriangle className="h-3 w-3 shrink-0" />
                  : <ArrowLeftRight className="h-3 w-3 shrink-0" />}
                {item.typeNotice.message}
              </span>
            )}
            {/* Duplicate-target chip — two queue rows writing the same
                (type|brand|date). The operator decides which one survives. */}
            {duplicateNotice && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pulse-warn)]/35 bg-[var(--pulse-warn-bg)] px-2 py-1 text-[11px] font-semibold text-[var(--pulse-warn)]">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {duplicateNotice}
              </span>
            )}
            {/* Overwrite chip — the queue-time answer to the old mid-run
                confirm(). Only appears when the day already has data. */}
            {item.existingCount === null && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> checking…
              </span>
            )}
            {typeof item.existingCount === 'number' && item.existingCount > 0 && (
              <label
                className={cn(
                  'inline-flex cursor-pointer select-none items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold',
                  item.overwriteOk !== false
                    ? 'border-[var(--pulse-warn)]/35 bg-[var(--pulse-warn-bg)] text-[var(--pulse-warn)]'
                    : 'border-border bg-muted text-muted-foreground',
                  !editable && 'cursor-default opacity-60',
                )}
                title="On: delete that day's existing rows, then insert this file. Off: merge this file on top without deleting."
              >
                <input
                  type="checkbox"
                  checked={item.overwriteOk !== false}
                  onChange={e => onChange({ overwriteOk: e.target.checked })}
                  disabled={!editable}
                  className="h-3 w-3 accent-[var(--pulse-warn)]"
                />
                Overwrite {item.existingCount.toLocaleString()} rows
              </label>
            )}
            {item.result && (
              <span className="text-xs text-[var(--pulse-pos)] font-medium ml-2">
                {item.result.rowCount.toLocaleString()} rows · ${Math.round(item.result.totalGmv).toLocaleString()} GMV · {item.result.totalOrders.toLocaleString()} orders
              </span>
            )}
          </div>
          {/* A failed row explains itself inline — the WHY was previously
              buried behind the "N log lines" toggle, which is how upload
              failures went unread for days during the Jen incident. */}
          {item.status === 'error' && (() => {
            const lastError = [...item.log].reverse().find(l => l.level === 'error')?.message;
            return lastError ? (
              <p className="mt-1.5 text-xs font-medium text-[var(--pulse-neg)]">{lastError}</p>
            ) : null;
          })()}
          {item.log.length > 0 && (
            <button
              onClick={() => onChange({ expanded: !item.expanded })}
              className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {item.expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {item.log.length} log line{item.log.length === 1 ? '' : 's'}
            </button>
          )}
          {item.expanded && item.log.length > 0 && (
            <pre className="mt-2 text-[11px] text-foreground bg-muted border border-border rounded-lg p-3 max-h-60 overflow-auto whitespace-pre-wrap leading-relaxed">
              {item.log.map((l, i) => (
                <div key={i} className={cn(
                  l.level === 'error'   ? 'text-red-600 font-semibold' :
                  l.level === 'warning' ? 'text-amber-500' :
                  l.level === 'success' ? 'text-emerald-500 font-semibold' :
                                          'text-foreground'
                )}>
                  {l.level === 'error' ? '✗ ' : l.level === 'warning' ? '⚠ ' : l.level === 'success' ? '✓ ' : '· '}{l.message}
                </div>
              ))}
            </pre>
          )}
        </div>
        <button
          onClick={onRemove}
          disabled={item.status === 'processing'}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
          aria-label="Remove from queue"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

// ── Type-specific parser dispatch ───────────────────────────────────

async function runTypeParser(item: QueueItem, rows: Record<string, unknown>[]): Promise<{
  table: 'creator_performance' | 'video_performance' | 'videos' | 'product_performance' | null;
  parsed: { records: unknown[]; matchedColumns: string[]; missingColumns: string[]; totalCols: number };
  errors: string[];
  warnings: string[];
  totalGmv: number;
  totalOrders: number;
}> {
  if (item.type === 'creator') {
    const p = parseCreatorRows(rows, item.brand, item.reportDate);
    const v = validateCreatorRecords(p.records);
    return {
      table: 'creator_performance',
      parsed: { records: p.records, matchedColumns: p.matchedColumns, missingColumns: p.missingColumns, totalCols: p.totalCols },
      errors: v.errors, warnings: v.warnings, totalGmv: v.totalGmv, totalOrders: v.totalOrders,
    };
  }
  if (item.type === 'video') {
    const p = parseVideoRows(rows, item.brand, item.reportDate);
    const v = validateVideoRecords(p.records);
    return {
      table: 'video_performance',
      parsed: { records: p.records, matchedColumns: p.matchedColumns, missingColumns: p.missingColumns, totalCols: p.totalCols },
      errors: v.errors, warnings: v.warnings, totalGmv: v.totalGmv, totalOrders: v.totalOrders,
    };
  }
  if (item.type === 'videolist') {
    const p = parseVideoListRows(rows, item.brand);
    return {
      table: 'videos',
      parsed: { records: p.records, matchedColumns: p.matchedColumns, missingColumns: p.missingColumns, totalCols: p.totalCols },
      errors: [], warnings: [],
      totalGmv: p.summary.totalGmv, totalOrders: p.summary.totalOrders,
    };
  }
  if (item.type === 'affiliateproduct') {
    const p = parseProductRows(rows, item.brand, item.reportDate);
    const v = validateProductRecords(p.records);
    return {
      table: 'product_performance',
      parsed: { records: p.records, matchedColumns: p.matchedColumns, missingColumns: p.missingColumns, totalCols: p.totalCols },
      errors: v.errors, warnings: v.warnings, totalGmv: v.totalGmv, totalOrders: v.totalOrders,
    };
  }
  return {
    table: null,
    parsed: { records: [], matchedColumns: [], missingColumns: [], totalCols: 0 },
    errors: [`Unknown file type: ${item.type}`],
    warnings: [],
    totalGmv: 0, totalOrders: 0,
  };
}
