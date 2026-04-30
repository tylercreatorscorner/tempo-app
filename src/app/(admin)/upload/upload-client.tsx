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
import { useCallback, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Trash2, Upload,
  ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react';
import { FreshnessPanel } from '@/components/upload/freshness-panel';
import { DataMatrix } from '@/components/upload/data-matrix';
import { UploadHistory } from '@/components/upload/upload-history';
import { cn } from '@/lib/utils';
import { ACTIVE_BRANDS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
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

export function UploadClient() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [running, setRunning] = useState(false);
  // Bumped each time a file uploads successfully — causes Freshness, Matrix,
  // and History panels to refetch so what just landed shows up immediately.
  const [refreshKey, setRefreshKey] = useState(0);

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
    const items: QueueItem[] = xlsxFiles.map(f => ({
      id: newId(),
      file: f,
      filename: f.name,
      type: detectFileType(f.name),
      brand: extractBrand(f.name),
      reportDate: extractDate(f.name),
      status: 'queued',
      log: [],
      expanded: false,
    }));
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

    // 1. Validate report date
    const dateCheck = validateReportDate(item.reportDate);
    if (!dateCheck.valid) {
      appendLog(item.id, 'error', dateCheck.error || 'Invalid date');
      updateItem(item.id, { status: 'error' });
      return;
    }
    if (dateCheck.warning) appendLog(item.id, 'warning', dateCheck.warning);

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

    if (parsed.records.length === 0) {
      appendLog(item.id, 'error', `No valid records after parsing. Check that columns match TikTok's export format.`);
      updateItem(item.id, { status: 'error' });
      return;
    }

    // 5. Surface validation
    for (const w of warnings.slice(0, 5)) appendLog(item.id, 'warning', w);
    if (warnings.length > 5) appendLog(item.id, 'warning', `...and ${warnings.length - 5} more warnings.`);
    if (errors.length > 0) {
      for (const e of errors) appendLog(item.id, 'error', e);
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
            `Overwrite ${j.existingCount.toLocaleString()} existing rows for ${BRAND_DISPLAY_NAMES[item.brand] ?? item.brand} on ${item.reportDate}?\n\n` +
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
    appendLog(item.id, 'info', `Uploading ${parsed.records.length.toLocaleString()} rows to ${table}...`);
    try {
      const res = await fetch('/api/upload/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table,
          brand: item.brand,
          reportDate: item.reportDate,
          records: parsed.records,
          overwrite,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      appendLog(
        item.id, 'success',
        `${j.upserted.toLocaleString()} rows upserted. Total GMV: $${totalGmv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, Orders: ${totalOrders.toLocaleString()}.`
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
            ? 'border-[#E91E8C] bg-pink-50'
            : 'border-gray-200 bg-gray-50/40 hover:border-gray-300'
        )}
      >
        <Upload className="h-7 w-7 text-gray-400 mx-auto mb-3" />
        <p className="text-sm font-semibold text-[#1A1B3A]">Drop TikTok Shop XLSX exports here</p>
        <p className="text-xs text-gray-500 mt-1">
          Filename auto-detection: <code className="text-gray-600">Brand_FileType_YYYYMMDD.xlsx</code>
        </p>
        <label className="inline-block mt-4 px-4 py-2 rounded-xl bg-[#E91E8C] hover:bg-[#d1177d] text-white text-sm font-semibold cursor-pointer transition-colors">
          Choose files
          <input type="file" multiple accept=".xlsx,.xls" className="hidden" onChange={onFileInput} />
        </label>
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div className="text-sm font-semibold text-[#1A1B3A]">
              Queue · <span className="text-gray-500 font-normal">{queue.length} file{queue.length === 1 ? '' : 's'}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-3 text-xs text-gray-500">
                {counts.queued > 0    && <span>{counts.queued} queued</span>}
                {counts.success > 0   && <span className="text-emerald-600">{counts.success} done</span>}
                {counts.error > 0     && <span className="text-red-500">{counts.error} failed</span>}
                {counts.cancelled > 0 && <span className="text-gray-500">{counts.cancelled} cancelled</span>}
              </div>
              <button
                onClick={clearQueue}
                disabled={running || counts.processing > 0}
                className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40"
              >
                Clear finished
              </button>
              <button
                onClick={processAll}
                disabled={running || counts.queued === 0}
                className="px-4 py-1.5 rounded-xl bg-[#E91E8C] hover:bg-[#d1177d] text-white text-sm font-semibold disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {running ? 'Processing...' : `Upload ${counts.queued} file${counts.queued === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
          <ul className="divide-y divide-gray-100">
            {queue.map(item => (
              <QueueRow key={item.id} item={item} onChange={p => updateItem(item.id, p)} onRemove={() => removeItem(item.id)} />
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
  item, onChange, onRemove,
}: {
  item: QueueItem;
  onChange: (patch: Partial<QueueItem>) => void;
  onRemove: () => void;
}) {
  const editable = item.status === 'queued' || item.status === 'error';

  const statusConfig = {
    queued:     { Icon: FileSpreadsheet, color: 'text-gray-400',    bg: 'bg-gray-50',    label: 'Queued' },
    processing: { Icon: Loader2,         color: 'text-[#E91E8C]',   bg: 'bg-pink-50',    label: 'Processing' },
    success:    { Icon: CheckCircle2,    color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Done' },
    error:      { Icon: AlertCircle,     color: 'text-red-500',     bg: 'bg-red-50',     label: 'Error' },
    cancelled:  { Icon: AlertTriangle,   color: 'text-gray-400',    bg: 'bg-gray-50',    label: 'Cancelled' },
  }[item.status];

  return (
    <li className="px-5 py-3">
      <div className="flex items-start gap-3">
        <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0', statusConfig.bg)}>
          <statusConfig.Icon className={cn('h-4 w-4', statusConfig.color, item.status === 'processing' && 'animate-spin')} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm font-medium text-[#1A1B3A] truncate">{item.filename}</span>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">{statusConfig.label}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={item.type}
              onChange={e => onChange({ type: e.target.value as FileType })}
              disabled={!editable}
              className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1.5 disabled:bg-gray-50 disabled:text-gray-400"
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
                'text-xs bg-white border rounded-lg px-2 py-1.5 disabled:bg-gray-50 disabled:text-gray-400',
                item.brand === 'unknown' ? 'border-amber-300 text-amber-700' : 'border-gray-200'
              )}
            >
              {item.brand === 'unknown' && <option value="unknown">Pick a brand…</option>}
              {ACTIVE_BRANDS.map(slug => (
                <option key={slug} value={slug}>{BRAND_DISPLAY_NAMES[slug] ?? slug}</option>
              ))}
            </select>
            <input
              type="date"
              value={item.reportDate}
              onChange={e => onChange({ reportDate: e.target.value })}
              disabled={!editable}
              className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1.5 disabled:bg-gray-50 disabled:text-gray-400"
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
              className="mt-2 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              {item.expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {item.log.length} log line{item.log.length === 1 ? '' : 's'}
            </button>
          )}
          {item.expanded && item.log.length > 0 && (
            <pre className="mt-2 text-[11px] text-gray-700 bg-gray-50 border border-gray-100 rounded-lg p-3 max-h-60 overflow-auto whitespace-pre-wrap leading-relaxed">
              {item.log.map((l, i) => (
                <div key={i} className={cn(
                  l.level === 'error'   ? 'text-red-600 font-semibold' :
                  l.level === 'warning' ? 'text-amber-700' :
                  l.level === 'success' ? 'text-emerald-700 font-semibold' :
                                          'text-gray-700'
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
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors"
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
