'use client';

/**
 * Cell detail — what a ledger cell opens to.
 *
 * WHY A DRAWER AND NOT A POPOVER: the ledger's grid lives inside an
 * `overflow-x: auto` container so the page body never scrolls sideways. Any
 * element anchored to a cell — a popover, a tooltip card — is CLIPPED by that
 * container the moment it grows past the cell, and the interesting cells are
 * often at the scrolled edge. A portaled side sheet escapes the clip entirely,
 * has room for the run history without truncating the diagnosis, and leaves the
 * brand column visible so the operator keeps their place in the grid. It also
 * inherits Esc-to-close and the ref-counted body scroll lock from ModalOverlay.
 *
 * Everything below the header is FETCHED, not inferred: row counts, the
 * ingestion_runs history, the last activity_log upload, and the brand-table
 * median that makes "5,000 rows" obviously wrong.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Check, Copy, Loader2, X,
} from 'lucide-react';
import Link from 'next/link';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  COVERAGE_TYPES,
  STATUS_LABEL,
  expectedFilename,
  shortDate,
  type CoverageCellDetail,
  type CoverageRun,
  type CoverageStatus,
  type CoverageTypeKey,
  type ExportLayout,
} from './coverage-types';
import type { LedgerSelection } from './coverage-ledger';

const STATUS_VARIANT: Record<CoverageStatus, 'positive' | 'warning' | 'negative' | 'neutral'> = {
  complete: 'positive',
  partial: 'warning',
  missing: 'negative',
  not_expected: 'neutral',
};

const RUN_DOT: Record<CoverageRun['status'], string> = {
  complete: 'bg-[var(--pulse-pos)]',
  partial: 'bg-[var(--pulse-warn)]',
  failed: 'bg-[var(--pulse-neg)]',
  running: 'bg-[var(--primary)]',
};

function typeLabel(key: CoverageTypeKey): string {
  return COVERAGE_TYPES.find((t) => t.key === key)?.label ?? key;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function CellDetailDrawer({
  selection,
  onClose,
}: {
  selection: LedgerSelection;
  onClose: () => void;
}) {
  const { brand, brandLabel, type, date, state } = selection;

  const [detail, setDetail] = useState<CoverageCellDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ brand, type, date });
      const res = await fetch(`/api/upload/coverage/cell?${params}`, { cache: 'no-store' });
      // Text first, then parse — a non-JSON body (auth redirect, platform
      // error page) must not surface as a raw SyntaxError quoting "<!DOCTYPE".
      // And res.ok is checked before the body is trusted: an error body has no
      // `state`, which would render as a cell with no history and no diagnosis
      // — the confident blank this whole page exists to stop.
      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(
          res.ok ? `Server returned a non-JSON response (HTTP ${res.status}).` : `HTTP ${res.status}`,
        );
      }
      if (!res.ok) {
        throw new Error((parsed as { error?: string })?.error || `HTTP ${res.status}`);
      }
      const body = parsed as CoverageCellDetail;
      setDetail(body);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this cell.');
    } finally {
      setLoading(false);
    }
  }, [brand, type, date]);

  useEffect(() => { void load(); }, [load]);

  // The ledger already knows the cell's headline state, so the drawer opens
  // fully populated at the top and fills in the evidence underneath. The
  // fetched state wins once it lands.
  const shown = detail?.state ?? state;
  const rows = shown.rows;
  const expected = shown.expectedRows ?? detail?.medianRows ?? null;
  const pct = rows != null && expected != null && expected > 0
    ? Math.min(100, Math.round((rows / expected) * 100))
    : null;

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex h-full justify-end">
        <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label={`${brandLabel}, ${shortDate(date)}, ${typeLabel(type)}`}
          onClick={(e) => e.stopPropagation()}
          className="animate-slide-in-right relative flex h-full w-full max-w-lg flex-col border-l border-border bg-card shadow-[var(--pulse-elev-2)]"
        >
          {/* Header */}
          <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Coverage detail
              </p>
              <h2 className="mt-1 truncate text-base font-bold text-foreground">
                {brandLabel} · {shortDate(date)}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{typeLabel(type)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant={STATUS_VARIANT[shown.status]} dot>
                {STATUS_LABEL[shown.status]}
              </Badge>
              <button
                onClick={onClose}
                aria-label="Close"
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          {/* Body — min-h-0 so this flex child can actually scroll. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {error && (
              <div className="m-5 flex items-start gap-2 rounded-lg border border-[var(--pulse-neg)]/30 bg-[var(--pulse-neg-bg)] px-3 py-2.5 text-[12px] text-[var(--pulse-neg)]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Couldn&apos;t load the evidence for this cell ({error}). The status above came
                  with the grid; the counts and run history below are unavailable.
                </span>
              </div>
            )}

            {/* Counts */}
            <section className="border-b border-border px-5 py-4">
              <Row label="Rows landed" value={rows != null ? rows.toLocaleString() : '—'} />
              <Row
                label="Rows expected"
                value={expected != null ? `~${expected.toLocaleString()}` : '—'}
              />
              {pct != null && (
                <div className="mt-2.5">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        shown.status === 'complete'
                          ? 'bg-[var(--pulse-pos)]'
                          : 'bg-[var(--pulse-warn)]',
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {pct}% of what this brand normally lands for this report
                  </p>
                </div>
              )}
              <Row
                label="Brand median"
                value={
                  loading && !detail
                    ? '…'
                    : detail?.medianRows != null
                      ? detail.medianRows.toLocaleString()
                      : '—'
                }
              />
              <Row
                label="Source"
                value={
                  shown.source === 'api'
                    ? 'TikTok Shop API'
                    : shown.source === 'upload'
                      ? 'Manual upload'
                      : '—'
                }
              />
              {detail?.lastUpload && (
                <Row
                  label="Last upload"
                  value={`${when(detail.lastUpload.createdAt)}${
                    detail.lastUpload.uploadedBy ? ` · ${detail.lastUpload.uploadedBy}` : ''
                  }`}
                />
              )}
            </section>

            {/* The diagnosis — rendered VERBATIM from the API. This sentence
                ("5,000 rows is an exact chunk multiple; brand median is
                40,606") is the whole reason the drawer exists. */}
            {shown.reason && (
              <section className="px-5 py-4">
                <div className="rounded-r-lg border border-l-[3px] border-border border-l-[var(--pulse-warn)] bg-secondary px-3.5 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Why it looks like this
                  </p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-foreground">
                    {shown.reason}
                  </p>
                </div>
              </section>
            )}

            {/* The neighbourhood. A partial does not need explaining once you
                can see it next to the days either side of it. */}
            {detail?.neighbours && detail.neighbours.some((n) => n.rows != null) && (
              <Neighbours neighbours={detail.neighbours} focusDate={date} />
            )}

            {/* Ingest log */}
            <section className="border-t border-border px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Ingest log
              </p>
              {loading && !detail ? (
                <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading run history…
                </p>
              ) : !detail?.runs || detail.runs.length === 0 ? (
                <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">
                  {error
                    ? 'Run history unavailable.'
                    : 'No ingestion run was ever recorded for this brand-day. Nothing tried and failed — nothing tried at all, which is exactly how six brands went dark for ten days without a single error to find.'}
                </p>
              ) : (
                <ul className="mt-2.5 space-y-2.5">
                  {detail.runs.map((run) => (
                    <li key={run.id} className="flex items-start gap-2.5">
                      <span
                        className={cn(
                          'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                          RUN_DOT[run.status],
                          run.status === 'running' && 'animate-pulse',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-semibold text-foreground">
                          {run.status === 'running' ? 'Started' : run.status === 'complete' ? 'Completed' : run.status === 'partial' ? 'Landed partial' : 'Failed'}
                          {' · '}
                          <span className="font-normal text-muted-foreground">
                            {run.source === 'api' ? 'API' : 'upload'}
                          </span>
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {when(run.startedAt)}
                          {run.rowsWritten != null && ` · ${run.rowsWritten.toLocaleString()} rows`}
                          {run.rowsExpected != null && ` of ~${run.rowsExpected.toLocaleString()}`}
                        </p>
                        {run.error && (
                          <p className="mt-0.5 break-words text-[11px] text-[var(--pulse-neg)]">
                            {run.error}
                          </p>
                        )}
                        {run.status === 'running' && !run.finishedAt && (
                          <p className="mt-0.5 text-[11px] text-[var(--pulse-warn)]">
                            Never finished — a run row that never advanced is the visible
                            evidence of a job that was killed mid-flight.
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Repair */}
            <Repair
              brand={brand}
              brandLabel={brandLabel}
              type={type}
              date={date}
              status={shown.status}
              layout={selection.exportLayout ?? 'unknown'}
            />
          </div>
        </aside>
      </div>
    </ModalOverlay>
  );
}

/**
 * Row counts for the fortnight around this cell, as bars. The selected day is
 * marked; a day with no data at all is drawn as an empty slot rather than a
 * zero-height bar, because "no rows" and "we never looked" are different.
 */
function Neighbours({
  neighbours,
  focusDate,
}: {
  neighbours: { date: string; rows: number | null }[];
  focusDate: string;
}) {
  const max = Math.max(...neighbours.map((n) => n.rows ?? 0), 1);

  return (
    <section className="border-t border-border px-5 py-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        Rows per day, around this one
      </p>
      {/* Each column is h-full so the bars' percentage heights have a resolved
          height to compute against — inside an `items-end` parent the column
          would shrink to its content and the percentage would collapse to 0. */}
      <div className="mt-3 flex h-16 gap-[3px]">
        {neighbours.map((n) => {
          const isFocus = n.date === focusDate;
          const h = n.rows != null ? Math.max(3, Math.round((n.rows / max) * 100)) : 0;
          return (
            <div
              key={n.date}
              className="group/bar flex h-full flex-1 flex-col items-center justify-end gap-1"
              title={`${shortDate(n.date)}: ${n.rows != null ? `${n.rows.toLocaleString()} rows` : 'no data'}`}
            >
              {n.rows != null ? (
                <span
                  className={cn(
                    'w-full rounded-[2px]',
                    isFocus ? 'bg-[var(--primary)]' : 'bg-muted-foreground/30',
                  )}
                  style={{ height: `${h}%` }}
                />
              ) : (
                <span
                  className={cn(
                    'w-full rounded-[2px] border border-dashed',
                    isFocus ? 'border-[var(--primary)]' : 'border-muted-foreground/30',
                  )}
                  style={{ height: '10%' }}
                />
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {shortDate(neighbours[0].date)} – {shortDate(neighbours[neighbours.length - 1].date)} ·
        hover a bar for its count. The highlighted bar is this cell.
      </p>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-border py-1.5 last:border-b-0">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="text-[12.5px] font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

// ── Repair ─────────────────────────────────────────────────────────────────

/**
 * Only affordances that EXIST today.
 *
 * There is deliberately NO "re-pull from API" button: no TikTok shop has
 * authorized yet, so nothing can be pulled. A button that cannot work is worse
 * than no button — it turns a known gap into a mystery.
 *
 * "Not expected" is likewise NOT a button here. Expectation is derived, not
 * stored: a brand is expected while it is unarchived, and a report is expected
 * of that brand once the brand has actually produced it. There is no override
 * table and no endpoint to write one, so this explains where the real control
 * lives and links to it instead of POSTing at a route that does not exist.
 */
function Repair({
  brand, brandLabel, type, date, status, layout,
}: {
  brand: string;
  brandLabel: string;
  type: CoverageTypeKey;
  date: string;
  status: CoverageStatus;
  layout: ExportLayout;
}) {
  const [copied, setCopied] = useState(false);
  const filename = expectedFilename(brandLabel, type, date, layout);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(filename);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (status === 'complete') {
    return (
      <section className="border-t border-border px-5 py-4">
        <p className="text-[12px] text-muted-foreground">
          This report landed and its row count was verified after the write. Nothing to repair.
        </p>
      </section>
    );
  }

  return (
    <section className="border-t border-border px-5 py-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        Repair
      </p>

      {status !== 'not_expected' && (
        <>
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-foreground">
            Export this report from TikTok Seller Center for {shortDate(date)} and drop it in the
            upload lane. The queue reads the brand, type and date straight off the name:
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-secondary px-2.5 py-1.5 font-mono text-[11.5px] text-foreground">
              {filename}
            </code>
            <Button variant="outline" size="sm" onClick={copy} aria-label="Copy expected filename">
              {copied ? <Check className="text-[var(--pulse-pos)]" /> : <Copy />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          {type === 'video' && (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {layout === 'split'
                ? 'This brand is still on the split export, so Video List and Video Data are different reports — the one above is the one that fills this cell.'
                : layout === 'merged'
                  ? 'This brand is on the merged export, where the file named Video List carries the video performance content.'
                  : 'Upload whichever video export TikTok gives you — on the merged export the Video List file carries this content, and on the older split export it arrives as Video Data.'}
            </p>
          )}

          {/* Expectation is DERIVED, so this is a signpost, not a switch. */}
          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
            Shouldn&apos;t {brandLabel} be producing this at all? Nothing here overrides that —
            a brand is expected while it is unarchived, and a report is expected of it once it has
            actually produced one. Archive the brand in{' '}
            <Link href={`/brands/${brand}`} className="font-semibold text-primary hover:underline">
              brand settings
            </Link>{' '}
            and its whole row becomes &quot;not expected&quot;.
          </p>
        </>
      )}

      {status === 'not_expected' && (
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
          Nothing is owed for this brand-day, so there is nothing to repair. This is not a gap.
        </p>
      )}
    </section>
  );
}
