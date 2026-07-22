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
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Trash2, Upload,
  ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react';
import { FreshnessPanel } from '@/components/upload/freshness-panel';
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
  type FileType,
} from '@/lib/upload/file-detection';
import {
  parseCreatorRows,
  parseVideoRows,
  parseVideoListRows,
  parseProductRows,
} from '@/lib/upload/parse-rows';
import { COLUMN_MAPS, auditColumnMatches, type UploadTable as MapTable } from '@/lib/upload/column-maps';
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
}

const FILE_TYPE_OPTIONS: { value: FileType; label: string }[] = [
  { value: 'creator',          label: 'Creator Data' },
  { value: 'video',            label: 'Video Data' },
  { value: 'videolist',        label: 'Video List' },
  { value: 'affiliateproduct', label: 'Transaction Analysis (Products)' },
  { value: 'unknown',          label: 'Unknown — pick one' },
];

function newId() { return Math.random().toString(36).slice(2, 10); }

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
  const [dragActive, setDragActive] = useState(false);
  const [running, setRunning] = useState(false);
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
        brand: extractBrand(f.name),
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
  }

  function updateItem(id: string, patch: Partial<QueueItem>) {
    setQueue(q => q.map(i => i.id === id ? { ...i, ...patch } : i));
  }

  function removeItem(id: string) {
    setQueue(q => q.filter(i => i.id !== id));
  }

  function clearQueue() {
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
      // Cross-audit the headers against every OTHER upload type's map. Feeding
      // a file into the wrong type (e.g. a daily Video DATA export saved as
      // "..._Video_List.xlsx" — the Bondie incident) matches almost nothing on
      // the chosen map but nearly everything on the right one — say so instead
      // of the generic "check the format".
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

    // 6. Existing-data check (skip for the 'videos' table — keyed differently)
    let overwrite = false;
    if (table !== 'videos') {
      try {
        const url = `/api/upload/check?table=${encodeURIComponent(table)}&brand=${encodeURIComponent(item.brand)}&date=${encodeURIComponent(item.reportDate)}`;
        const res = await fetch(url);
        const j = await res.json();
        if (res.ok && j.existingCount > 0) {
          appendLog(item.id, 'warning', `Found ${j.existingCount.toLocaleString()} existing rows for ${item.brand} on ${item.reportDate}.`);
          const ok = window.confirm(
            `Overwrite ${j.existingCount.toLocaleString()} existing rows for ${brandLabelBySlug.get(item.brand) ?? item.brand} on ${item.reportDate}?\n\n` +
            `Click OK to delete existing rows + insert new (${parsed.records.length.toLocaleString()} rows). Cancel to skip this file.`
          );
          if (!ok) {
            appendLog(item.id, 'warning', 'Cancelled by user.');
            updateItem(item.id, { status: 'cancelled' });
            return;
          }
          overwrite = true;
          appendLog(item.id, 'info', 'Will overwrite existing rows.');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'check failed';
        appendLog(item.id, 'warning', `Existing-data check failed (${message}) — proceeding anyway.`);
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

    try {
      let totalUpserted = 0;
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
          }),
        });
        // Body-too-large surfaces as a non-JSON plain-text response from the
        // platform (not our route) — read as text first and surface clearly
        // instead of dying on JSON.parse.
        const text = await res.text();
        let j: { error?: string; upserted?: number; idempotent?: boolean; message?: string };
        try {
          j = JSON.parse(text);
        } catch {
          throw new Error(
            res.status === 413
              ? `Chunk ${i + 1}/${chunks.length} rejected as too large (${chunk.length.toLocaleString()} rows) even after size-based chunking (~${Math.round(CHUNK_TARGET_BYTES / 1024 / 1024)} MB target). A single row may exceed the platform body cap — file a bug.`
              : `HTTP ${res.status}: ${text.slice(0, 200)}`
          );
        }
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        if (j.idempotent) {
          appendLog(item.id, 'info', j.message ?? 'Identical chunk was already processed (idempotency).');
        }
        totalUpserted += j.upserted ?? 0;
        if (chunks.length > 1) {
          appendLog(item.id, 'info', `Chunk ${i + 1}/${chunks.length}: ${(j.upserted ?? 0).toLocaleString()} rows upserted.`);
        }
      }

      appendLog(
        item.id, 'success',
        `${totalUpserted.toLocaleString()} rows upserted. Total GMV: $${totalGmv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, Orders: ${totalOrders.toLocaleString()}.`
      );
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

  // Snapshot the queue items to process at click time. Edits during processing
  // (which user can't make anyway, since editable=false during 'processing')
  // are not picked up — the user changes need to happen before they hit Upload.
  async function processAll() {
    setRunning(true);
    try {
      const toProcess = queue.filter(q => q.status === 'queued');
      for (const item of toProcess) {
        await processItem(item);
      }
    } finally {
      setRunning(false);
    }
  }

  const counts = useMemo(() => {
    const c = { queued: 0, processing: 0, success: 0, error: 0, cancelled: 0 };
    for (const i of queue) c[i.status]++;
    return c;
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
                Browser refreshed mid-upload. Re-drop these files (we can't auto-recover
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

      {/* Freshness — at-a-glance: which brand uploads are current vs stale */}
      <FreshnessPanel refreshKey={refreshKey} />

      {/* Drop zone + queue */}
      <div className="space-y-5">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={cn(
          'rounded-2xl border-2 border-dashed p-10 text-center transition-colors',
          dragActive
            ? 'border-[var(--primary)] bg-primary/10'
            : 'border-border bg-muted/40 hover:border-border'
        )}
      >
        <Upload className="h-7 w-7 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-semibold text-[var(--foreground)]">Drop TikTok Shop XLSX exports here</p>
        <p className="text-xs text-muted-foreground mt-1">
          Filename auto-detection: <code className="text-muted-foreground">Brand_FileType_YYYYMMDD.xlsx</code>
        </p>
        <label className="inline-block mt-4 px-4 py-2 rounded-xl bg-[var(--primary)] hover:brightness-[1.07] text-white text-sm font-semibold cursor-pointer transition-colors">
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
              <QueueRow key={item.id} item={item} brands={activeBrands} onChange={p => updateItem(item.id, p)} onRemove={() => removeItem(item.id)} />
            ))}
          </ul>
        </div>
      )}
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
  item, brands, onChange, onRemove,
}: {
  item: QueueItem;
  brands: ActiveBrand[];
  onChange: (patch: Partial<QueueItem>) => void;
  onRemove: () => void;
}) {
  const editable = item.status === 'queued' || item.status === 'error';

  const statusConfig = {
    queued:     { Icon: FileSpreadsheet, color: 'text-muted-foreground',    bg: 'bg-muted',    label: 'Queued' },
    processing: { Icon: Loader2,         color: 'text-[var(--primary)]',   bg: 'bg-primary/10',    label: 'Processing' },
    success:    { Icon: CheckCircle2,    color: 'text-emerald-600', bg: 'bg-emerald-500/10', label: 'Done' },
    error:      { Icon: AlertCircle,     color: 'text-red-500',     bg: 'bg-red-500/10',     label: 'Error' },
    cancelled:  { Icon: AlertTriangle,   color: 'text-muted-foreground',    bg: 'bg-muted',    label: 'Cancelled' },
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
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{statusConfig.label}</span>
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
            {item.result && (
              <span className="text-xs text-emerald-600 font-medium ml-2">
                {item.result.rowCount.toLocaleString()} rows · ${Math.round(item.result.totalGmv).toLocaleString()} GMV · {item.result.totalOrders.toLocaleString()} orders
              </span>
            )}
          </div>
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

void FILE_TYPE_LABELS; // keep import for dropdown labels in case we re-introduce it
