'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import {
  X, Upload, FileSpreadsheet, ClipboardList, Loader2, AlertCircle,
  CheckCircle2, MinusCircle, Users,
} from 'lucide-react';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { SegmentedControl } from '@/components/ui/segmented';
import { TableCard, Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { useBrandList } from '@/hooks/use-brand-list';

import {
  type BulkRow,
  type RejectedRow,
  type NotedRow,
  rowsFromCsv,
  rowsFromPaste,
  dedupeByHandle,
  toNum,
} from '@/lib/roster/bulk-parse';

// Re-exported: /roster/page.tsx has always imported BulkRow from this module,
// and moving the parser out is not a reason to break that import.
export type { BulkRow, RejectedRow, NotedRow } from '@/lib/roster/bulk-parse';

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

export function BulkAddModal({ defaultBrand, initialRows, onClose, onSuccess }: BulkAddModalProps) {
  const { brands } = useBrandList();
  const hasInitial = !!initialRows && initialRows.length > 0;
  const [mode, setMode] = useState<Mode>('paste');
  const [brand, setBrand] = useState(defaultBrand && defaultBrand !== 'all' ? defaultBrand : '');
  const [pasteText, setPasteText] = useState('');
  const [csvRows, setCsvRows] = useState<BulkRow[]>([]);
  // Rejected + adjusted rows travel WITH the good ones. A CSV import that
  // quietly drops three of twenty-eight looks identical to one that imported
  // everything, and the operator only finds out when a creator is missing at
  // invoice time.
  const [csvRejected, setCsvRejected] = useState<RejectedRow[]>([]);
  const [csvNotes, setCsvNotes] = useState<NotedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [csvError, setCsvError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [defRetainer, setDefRetainer] = useState('');
  const [defPosts, setDefPosts] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BulkResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pasteOutcome = useMemo(() => rowsFromPaste(pasteText), [pasteText]);

  const rows = useMemo<BulkRow[]>(
    () => dedupeByHandle(hasInitial ? initialRows! : mode === 'paste' ? pasteOutcome.rows : csvRows),
    [hasInitial, initialRows, mode, pasteOutcome, csvRows],
  );
  const rejected = hasInitial ? [] : mode === 'paste' ? pasteOutcome.rejected : csvRejected;
  const notes = hasInitial ? [] : mode === 'paste' ? pasteOutcome.notes : csvNotes;

  const handleFile = useCallback((file: File) => {
    setCsvError('');
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = rowsFromCsv((e.target?.result as string) || '');
      if (parsed.error) {
        setCsvError(parsed.error); setCsvRows([]); setCsvRejected([]); setCsvNotes([]);
        return;
      }
      setCsvRows(parsed.rows);
      setCsvRejected(parsed.rejected);
      setCsvNotes(parsed.notes);
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
        <Card
          className="relative w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <CardTitle>Bulk add creators</CardTitle>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              <X className="text-muted-foreground" />
            </Button>
          </div>

          {/* ── Result screen ── */}
          {result ? (
            <div className="p-6 space-y-4">
              {result.added > 0 && (
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--pulse-pos)] bg-[var(--pulse-pos-bg)] rounded-xl px-4 py-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  Added {result.added} creator{result.added === 1 ? '' : 's'}
                  {brandName ? <span className="font-normal text-[var(--pulse-pos)]">to {brandName}</span> : null}
                </div>
              )}

              {(result.restored ?? 0) > 0 && (
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--pulse-pos)] bg-[var(--pulse-pos-bg)] rounded-xl px-4 py-3">
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
                <div className="text-sm bg-[var(--pulse-warn-bg)] rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 font-semibold text-[var(--pulse-warn)]">
                    <MinusCircle className="h-4 w-4 shrink-0" />
                    Skipped {result.skipped.length} already on this roster
                  </div>
                  <p className="text-xs text-[var(--pulse-warn)] mt-1 break-words">
                    {result.skipped.slice(0, 12).map((s) => `@${s.handle}`).join(', ')}
                    {result.skipped.length > 12 ? ` +${result.skipped.length - 12} more` : ''}
                  </p>
                </div>
              )}

              {result.failed.length > 0 && (
                <div className="text-sm bg-[var(--pulse-neg-bg)] rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 font-semibold text-[var(--pulse-neg)]">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {result.failed.length} couldn’t be added
                  </div>
                  <p className="text-xs text-[var(--pulse-neg)] mt-1 break-words">
                    {result.failed.slice(0, 8).map((f) => `@${f.handle}`).join(', ')}
                  </p>
                </div>
              )}

              {result.warnings.length > 0 && (
                <div className="text-xs text-[var(--pulse-warn)]">
                  {result.warnings.map((w, i) => <p key={i}>{w}</p>)}
                </div>
              )}

              <Button variant="primary" size="lg" onClick={onClose} className="w-full">
                Done
              </Button>
            </div>
          ) : (
            /* ── Input screen ── */
            <div className="p-6 space-y-4">
              {error && (
                <div className="flex items-center gap-2 text-sm text-[var(--pulse-neg)] bg-[var(--pulse-neg-bg)] rounded-xl px-4 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* Brand picker — required, one per batch */}
              <div>
                <Label>Brand <span className="text-primary">*</span></Label>
                <Select value={brand} onChange={(e) => setBrand(e.target.value)}>
                  <option value="">Select brand…</option>
                  {brands.map((b) => (
                    <option key={b.slug} value={b.slug}>{b.name}</option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Every creator in this batch is added under this brand.</p>
              </div>

              {/* Pre-selected creators (multi-select entry point) */}
              {hasInitial && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-primary/10 border border-primary/10 rounded-xl px-4 py-2.5">
                  <Users className="h-4 w-4 text-primary shrink-0" />
                  {initialRows!.length} creator{initialRows!.length === 1 ? '' : 's'} selected from All Creators
                </div>
              )}

              {/* Mode tabs (paste / CSV) — hidden when creators were pre-selected */}
              {!hasInitial && (
              <>
              <SegmentedControl<Mode>
                ariaLabel="Input mode"
                value={mode}
                onValueChange={setMode}
                options={[
                  { value: 'paste', label: <span className="inline-flex items-center gap-1.5"><ClipboardList className="h-4 w-4" /> Paste handles</span> },
                  { value: 'csv', label: <span className="inline-flex items-center gap-1.5"><FileSpreadsheet className="h-4 w-4" /> Upload CSV</span> },
                ]}
              />

              {/* Paste input */}
              {mode === 'paste' && (
                <div>
                  <Textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={7}
                    placeholder={'@creator_one\n@creator_two, Jane Smith\n@creator_three'}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground mt-1">One handle per line. Add a name after a comma: <code>@handle, Real Name</code>.</p>
                </div>
              )}

              {/* CSV input */}
              {mode === 'csv' && (
                <div>
                  {csvError && (
                    <div className="flex items-center gap-2 text-sm text-[var(--pulse-neg)] bg-[var(--pulse-neg-bg)] rounded-xl px-4 py-2 mb-2">
                      <AlertCircle className="h-4 w-4 shrink-0" /> {csvError}
                    </div>
                  )}
                  {csvRows.length === 0 ? (
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={onDrop}
                      onClick={() => inputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                        dragOver ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/60'
                      }`}
                    >
                      <Upload className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm font-medium text-foreground">Drop a CSV here or click to browse</p>
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
                        <span className="font-medium text-foreground">{fileName}</span> — {csvRows.length} rows
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setCsvRows([]); setFileName(''); setCsvError(''); }}
                      >
                        Clear
                      </Button>
                    </div>
                  )}
                </div>
              )}
              </>
              )}

              {/* Optional batch defaults */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Default retainer ($)</Label>
                  <Input
                    type="number" min="0" inputMode="decimal" placeholder="optional"
                    value={defRetainer}
                    onChange={(e) => setDefRetainer(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Default posts / month</Label>
                  <Input
                    type="number" min="0" inputMode="numeric" placeholder="30"
                    value={defPosts}
                    onChange={(e) => setDefPosts(e.target.value)}
                  />
                </div>
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">
                Applied to every creator that doesn’t set its own. Leave blank to set retainer / posts later.
              </p>

              {/* Preview */}
              {rows.length > 0 && (
                <TableCard>
                  <div className="overflow-x-auto max-h-44">
                    <Table className="text-sm">
                      <THead className="sticky top-0">
                        <TR>
                          <TH>Handle</TH>
                          <TH className="text-left">Name</TH>
                          <TH className="text-left">Retainer</TH>
                          <TH className="text-left">Posts</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {rows.slice(0, 50).map((r, i) => (
                          <TR key={i} className="hover:bg-muted">
                            <TD className="font-medium text-foreground">
                              @{r.handle}
                              {/* The other accounts of the SAME person. Shown so
                                  "one creator, three handles" is visibly one row
                                  rather than looking like two got lost. */}
                              {r.extraHandles && r.extraHandles.length > 0 && (
                                <span className="text-muted-foreground font-normal">
                                  {' '}+ {r.extraHandles.map((h) => `@${h}`).join(', ')}
                                </span>
                              )}
                            </TD>
                            <TD className="text-left">{r.name || '—'}</TD>
                            <TD className="text-left">{r.retainer ? `$${r.retainer}` : '—'}</TD>
                            <TD className="text-left">{r.monthly_post_requirement ?? '—'}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>
                  {rows.length > 50 && (
                    <p className="text-xs text-muted-foreground px-4 py-2 bg-secondary border-t border-border">Showing first 50 of {rows.length}</p>
                  )}
                </TableCard>
              )}

              {/* Rows we changed. A silent "correction" is a guess the operator
                  never got to veto, so every adjustment is stated. */}
              {notes.length > 0 && (
                <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 space-y-1">
                  {notes.map((n, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">@{n.handle}</span> — {n.note}
                    </p>
                  ))}
                </div>
              )}

              {/* Rows we refused. NEVER silent: a creator that disappears between
                  the spreadsheet and the roster is one nobody gets paid. */}
              {rejected.length > 0 && (
                <div className="rounded-lg border border-[var(--pulse-warn)]/40 bg-[var(--pulse-warn)]/5 px-3 py-2 space-y-1">
                  <p className="text-xs font-medium text-[var(--pulse-warn)] flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {rejected.length} row{rejected.length === 1 ? '' : 's'} will NOT be added
                  </p>
                  {rejected.map((r, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      {r.name ? <span className="text-foreground">{r.name}</span> : null}
                      {r.name ? ' — ' : null}{r.reason}
                    </p>
                  ))}
                </div>
              )}

              {/* Submit */}
              <Button
                variant="primary"
                size="lg"
                onClick={submit}
                disabled={submitting || rows.length === 0 || !brand}
                className="w-full"
              >
                {submitting ? <Loader2 className="animate-spin" /> : <Users />}
                {rows.length > 0 ? `Add ${rows.length} creator${rows.length === 1 ? '' : 's'}` : 'Add creators'}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </ModalOverlay>
  );
}
