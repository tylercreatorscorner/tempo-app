'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import {
  X, Upload, FileSpreadsheet, ClipboardList, Loader2, AlertCircle,
  CheckCircle2, MinusCircle, Users,
} from 'lucide-react';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { useBrandList } from '@/hooks/use-brand-list';

// One creator headed for the roster. Only `handle` is required; the rest are
// optional and fall back to the batch defaults / endpoint defaults.
export interface BulkRow {
  handle: string;
  name?: string;
  retainer?: number;
  monthly_post_requirement?: number;
}

interface BulkAddModalProps {
  // Pre-selected brand slug (e.g. the roster's active brand filter). '' / 'all'
  // means "no brand chosen yet" — the user must pick one before submitting.
  defaultBrand?: string;
  // When provided (e.g. from multi-select on the All-Creators view), the modal
  // skips paste/CSV input and adds exactly these creators. The brand picker +
  // optional defaults still apply.
  initialRows?: BulkRow[];
  onClose: () => void;
  onSuccess: () => void;
}

type Mode = 'paste' | 'csv';

interface BulkResult {
  added: number;
  restored: number;
  skipped: { handle: string; reason: string }[];
  failed: { handle: string; error: string }[];
  warnings: string[];
  total: number;
}

// ── CSV parsing (quote-aware, mirrors the single-cell parser elsewhere). ──
function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; }
      else q = !q;
    } else if (ch === ',' && !q) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

// Forgiving header aliases so a roughly-shaped spreadsheet still imports.
const HANDLE_KEYS = ['handle', 'creator_handle', 'tiktok_handle', 'tiktok_username', 'username', 'account'];
const NAME_KEYS = ['name', 'creator_name', 'real_name', 'full_name'];
const RETAINER_KEYS = ['retainer', 'retainer_amount', 'monthly_retainer'];
const POSTS_KEYS = ['monthly_post_requirement', 'posts_per_month', 'posts', 'post_requirement'];

function pick(row: Record<string, string>, keys: string[]): string {
  for (const k of keys) if (row[k]) return row[k];
  return '';
}

function toNum(v: string): number | undefined {
  if (!v) return undefined;
  const n = Number(v.replace(/[$,]/g, ''));
  // >= 0 so an explicit 0 (e.g. a $0 retainer) survives instead of being
  // dropped and silently replaced by the batch default downstream.
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

// Dedup by lowercased handle (keep first) so the preview + button count match
// what the server actually adds — the endpoint dedups the same way.
function dedupeByHandle(rows: BulkRow[]): BulkRow[] {
  const seen = new Set<string>();
  const out: BulkRow[] = [];
  for (const r of rows) {
    const k = r.handle.toLowerCase().replace(/^@/, '');
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

function rowsFromCsv(text: string): { rows: BulkRow[]; error: string | null } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { rows: [], error: null };
  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  if (!HANDLE_KEYS.some((k) => headers.includes(k))) {
    return { rows: [], error: 'CSV needs a handle column (e.g. "handle" or "creator_handle").' };
  }
  const rows: BulkRow[] = [];
  for (const line of lines.slice(1)) {
    const vals = parseLine(line);
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => { rec[h] = vals[i] ?? ''; });
    const handle = pick(rec, HANDLE_KEYS).replace(/^@/, '').trim();
    if (!handle) continue;
    rows.push({
      handle,
      name: pick(rec, NAME_KEYS) || undefined,
      retainer: toNum(pick(rec, RETAINER_KEYS)),
      monthly_post_requirement: toNum(pick(rec, POSTS_KEYS)),
    });
  }
  return { rows, error: null };
}

// Paste mode: one creator per line, optionally "handle, name".
function rowsFromPaste(text: string): BulkRow[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [h, ...rest] = parseLine(line);
      const handle = (h || '').replace(/^@/, '').trim();
      const name = rest.join(', ').trim();
      return { handle, name: name || undefined };
    })
    .filter((r) => r.handle.length > 0);
}

export function BulkAddModal({ defaultBrand, initialRows, onClose, onSuccess }: BulkAddModalProps) {
  const { brands } = useBrandList();
  const hasInitial = !!initialRows && initialRows.length > 0;
  const [mode, setMode] = useState<Mode>('paste');
  const [brand, setBrand] = useState(defaultBrand && defaultBrand !== 'all' ? defaultBrand : '');
  const [pasteText, setPasteText] = useState('');
  const [csvRows, setCsvRows] = useState<BulkRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [csvError, setCsvError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [defRetainer, setDefRetainer] = useState('');
  const [defPosts, setDefPosts] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BulkResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const rows = useMemo<BulkRow[]>(
    () => dedupeByHandle(hasInitial ? initialRows! : mode === 'paste' ? rowsFromPaste(pasteText) : csvRows),
    [hasInitial, initialRows, mode, pasteText, csvRows],
  );

  const handleFile = useCallback((file: File) => {
    setCsvError('');
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const { rows: parsed, error: err } = rowsFromCsv((e.target?.result as string) || '');
      if (err) { setCsvError(err); setCsvRows([]); return; }
      setCsvRows(parsed);
    };
    reader.readAsText(file);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const submit = async () => {
    if (!brand) { setError('Pick a brand for this batch.'); return; }
    if (rows.length === 0) { setError('Add at least one creator.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/roster/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand,
          creators: rows,
          defaults: {
            retainer: toNum(defRetainer),
            monthly_post_requirement: toNum(defPosts),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Bulk add failed'); return; }
      setResult(data as BulkResult);
      onSuccess();
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const brandName = brands.find((b) => b.slug === brand)?.name;

  return (
    <ModalOverlay onClose={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="relative w-full max-w-2xl bg-card rounded-2xl shadow-2xl mx-4 max-h-[90vh] overflow-y-auto pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#E91E8C]" />
              <h2 className="text-base font-bold text-[var(--foreground)]">Bulk add creators</h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          {/* ── Result screen ── */}
          {result ? (
            <div className="p-6 space-y-4">
              {result.added > 0 && (
                <div className="flex items-center gap-2 text-sm font-semibold text-green-500 bg-green-500/10 rounded-xl px-4 py-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  Added {result.added} creator{result.added === 1 ? '' : 's'}
                  {brandName ? <span className="font-normal text-green-600">to {brandName}</span> : null}
                </div>
              )}

              {(result.restored ?? 0) > 0 && (
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-500 bg-emerald-500/10 rounded-xl px-4 py-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  Restored {result.restored} previously-removed creator{result.restored === 1 ? '' : 's'}
                </div>
              )}

              {result.added === 0 && (result.restored ?? 0) === 0 && result.failed.length === 0 && (
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground bg-muted rounded-xl px-4 py-3">
                  <MinusCircle className="h-5 w-5 shrink-0" />
                  No new creators added — all {result.total} were already on this roster
                </div>
              )}

              {result.skipped.length > 0 && (
                <div className="text-sm bg-amber-500/10 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 font-semibold text-amber-500">
                    <MinusCircle className="h-4 w-4 shrink-0" />
                    Skipped {result.skipped.length} already on this roster
                  </div>
                  <p className="text-xs text-amber-600 mt-1 break-words">
                    {result.skipped.slice(0, 12).map((s) => `@${s.handle}`).join(', ')}
                    {result.skipped.length > 12 ? ` +${result.skipped.length - 12} more` : ''}
                  </p>
                </div>
              )}

              {result.failed.length > 0 && (
                <div className="text-sm bg-red-500/10 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 font-semibold text-red-500">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {result.failed.length} couldn’t be added
                  </div>
                  <p className="text-xs text-red-600 mt-1 break-words">
                    {result.failed.slice(0, 8).map((f) => `@${f.handle}`).join(', ')}
                  </p>
                </div>
              )}

              {result.warnings.length > 0 && (
                <div className="text-xs text-amber-600">
                  {result.warnings.map((w, i) => <p key={i}>{w}</p>)}
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-[#E91E8C] rounded-xl hover:bg-[#d4177d] transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            /* ── Input screen ── */
            <div className="p-6 space-y-4">
              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-500/10 rounded-xl px-4 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* Brand picker — required, one per batch */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Brand <span className="text-[#E91E8C]">*</span>
                </label>
                <select
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C] bg-card"
                >
                  <option value="">Select brand…</option>
                  {brands.map((b) => (
                    <option key={b.slug} value={b.slug}>{b.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">Every creator in this batch is added under this brand.</p>
              </div>

              {/* Pre-selected creators (multi-select entry point) */}
              {hasInitial && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-primary/10/60 border border-primary/10 rounded-xl px-4 py-2.5">
                  <Users className="h-4 w-4 text-[#E91E8C] shrink-0" />
                  {initialRows!.length} creator{initialRows!.length === 1 ? '' : 's'} selected from All Creators
                </div>
              )}

              {/* Mode tabs (paste / CSV) — hidden when creators were pre-selected */}
              {!hasInitial && (
              <>
              <div className="inline-flex rounded-xl bg-muted p-0.5">
                <button
                  onClick={() => setMode('paste')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    mode === 'paste' ? 'bg-card text-[var(--foreground)] shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <ClipboardList className="h-4 w-4" /> Paste handles
                </button>
                <button
                  onClick={() => setMode('csv')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    mode === 'csv' ? 'bg-card text-[var(--foreground)] shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <FileSpreadsheet className="h-4 w-4" /> Upload CSV
                </button>
              </div>

              {/* Paste input */}
              {mode === 'paste' && (
                <div>
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={7}
                    placeholder={'@creator_one\n@creator_two, Jane Smith\n@creator_three'}
                    className="w-full px-3 py-2 text-sm font-mono border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C] resize-y"
                  />
                  <p className="text-xs text-muted-foreground mt-1">One handle per line. Add a name after a comma: <code>@handle, Real Name</code>.</p>
                </div>
              )}

              {/* CSV input */}
              {mode === 'csv' && (
                <div>
                  {csvError && (
                    <div className="flex items-center gap-2 text-sm text-red-600 bg-red-500/10 rounded-xl px-4 py-2 mb-2">
                      <AlertCircle className="h-4 w-4 shrink-0" /> {csvError}
                    </div>
                  )}
                  {csvRows.length === 0 ? (
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={onDrop}
                      onClick={() => inputRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
                        dragOver ? 'border-[#E91E8C] bg-primary/10' : 'border-border hover:border-border'
                      }`}
                    >
                      <Upload className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm font-medium text-[var(--foreground)]">Drop a CSV here or click to browse</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Required: <code>handle</code>. Optional: <code>name</code>, <code>retainer</code>, <code>posts_per_month</code>.
                      </p>
                      <input
                        ref={inputRef}
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-sm bg-muted rounded-xl px-4 py-2.5">
                      <span className="text-muted-foreground">
                        <span className="font-medium text-[var(--foreground)]">{fileName}</span> — {csvRows.length} rows
                      </span>
                      <button
                        onClick={() => { setCsvRows([]); setFileName(''); setCsvError(''); }}
                        className="text-xs text-muted-foreground hover:text-muted-foreground"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
              )}
              </>
              )}

              {/* Optional batch defaults */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Default retainer ($)
                  </label>
                  <input
                    type="number" min="0" inputMode="decimal" placeholder="optional"
                    value={defRetainer}
                    onChange={(e) => setDefRetainer(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Default posts / month
                  </label>
                  <input
                    type="number" min="0" inputMode="numeric" placeholder="30"
                    value={defPosts}
                    onChange={(e) => setDefPosts(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
                  />
                </div>
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">
                Applied to every creator that doesn’t set its own. Leave blank to set retainer / posts later.
              </p>

              {/* Preview */}
              {rows.length > 0 && (
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="overflow-x-auto max-h-44">
                    <table className="w-full text-sm">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Handle</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Retainer</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Posts</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {rows.slice(0, 50).map((r, i) => (
                          <tr key={i} className="hover:bg-muted">
                            <td className="px-4 py-1.5 font-medium text-[var(--foreground)]">@{r.handle}</td>
                            <td className="px-4 py-1.5 text-muted-foreground">{r.name || '—'}</td>
                            <td className="px-4 py-1.5 text-muted-foreground">{r.retainer ? `$${r.retainer}` : '—'}</td>
                            <td className="px-4 py-1.5 text-muted-foreground">{r.monthly_post_requirement ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {rows.length > 50 && (
                    <p className="text-xs text-muted-foreground px-4 py-2 bg-muted">Showing first 50 of {rows.length}</p>
                  )}
                </div>
              )}

              {/* Submit */}
              <button
                onClick={submit}
                disabled={submitting || rows.length === 0 || !brand}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#E91E8C] rounded-xl hover:bg-[#d4177d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                {rows.length > 0 ? `Add ${rows.length} creator${rows.length === 1 ? '' : 's'}` : 'Add creators'}
              </button>
            </div>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
