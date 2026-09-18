'use client';

/**
 * Client reporting table — the reporting page's primary surface.
 *
 * One row per client brand: how complete its data is, when it was last
 * reported to, and whether the client opened it. Coverage lives IN the row
 * rather than in a page-level banner, because the answer is per brand. After
 * the cross-brand overwrite repair, lemme had real gaps in a window where
 * every other brand was fine, and a banner cannot say that.
 *
 * A brand whose data cannot support a report loses its Generate button rather
 * than quietly producing one from a handful of days.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, RotateCw, Send, ExternalLink, Clipboard, Check, Search, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableCard, Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { TableLoadBar } from '@/components/ui/table-load-bar';
import { TableSkeleton } from '@/components/ui/page-skeletons';
import { EmptyState } from '@/components/ui/empty-state';
import { ReportActions } from './report-actions';
import { BrandIdentity } from '@/components/creators/brand-identity';

export interface ReportingBrandRow {
  slug: string;
  name: string;
  color: string;
  coverage: {
    daysExpected: number;
    daysPresent: number;
    presentDays: string[];
    missingDays: string[];
    windowStart: string | null;
    windowEnd: string | null;
    lastDataDay: string | null;
    daysBehind: number | null;
  };
  lastReport: {
    id: string;
    createdAt: string;
    periodLabel: string | null;
    viewedAt: string | null;
    revokedAt: string | null;
    url: string | null;
    token: string;
    notes: string | null;
    plan: string | null;
    /** Paste-ready client message, built server side from this report's own
     *  notes and plan so it cannot disagree with the page. */
    shareMessage: string | null;
  } | null;
  reportCount: number;
}

/** Below this share of the window, a report would be built on so little data
 *  that generating it is the wrong default. Chosen to let a normal 1-2 day
 *  upload lag through while stopping a brand that has gone dark. */
const REPORTABLE_RATIO = 0.5;
/** More than this far behind the freshest day anywhere and the brand is stale
 *  regardless of how many days it does have. */
const MAX_DAYS_BEHIND = 5;

function isReportable(r: ReportingBrandRow): boolean {
  const c = r.coverage;
  if (c.daysPresent === 0) return false;
  if (c.daysBehind !== null && c.daysBehind > MAX_DAYS_BEHIND) return false;
  return c.daysPresent / Math.max(c.daysExpected, 1) >= REPORTABLE_RATIO;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysAgo(iso: string): number | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/** One tick per day in the window. Gaps read as gaps. */
function CoverageMeter({ coverage }: { coverage: ReportingBrandRow['coverage'] }) {
  const { presentDays, missingDays, daysExpected, daysPresent, windowStart, windowEnd } = coverage;
  const all = [...presentDays, ...missingDays].sort();
  const label = windowStart && windowEnd
    ? `${daysPresent} of ${daysExpected} days present, ${windowStart} to ${windowEnd}`
    : `${daysPresent} of ${daysExpected} days present`;

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <div className="flex items-center gap-[2px]" role="img" aria-label={label} title={label}>
        {all.map((d) => (
          <span
            key={d}
            className={cn(
              'h-[15px] w-[5px] rounded-[1.5px]',
              presentDays.includes(d) ? 'bg-[var(--pulse-pos)]/85' : 'bg-border',
            )}
          />
        ))}
      </div>
      <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
        {daysPresent} / {daysExpected}
      </span>
    </div>
  );
}

const HEADERS = ['Brand', 'Data coverage', 'Latest report'] as const;

export function BrandTable({
  refreshKey, onGenerate,
}: {
  refreshKey: number;
  onGenerate: (slug: string, name: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'ready' | 'review'>('all');
  const [rows, setRows] = useState<ReportingBrandRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetching, setRefetching] = useState(false);
  const [nonce, setNonce] = useState(0);
  const showBar = useDelayedFlag(refetching);

  const load = useCallback(async (cancelled: () => boolean) => {
    setRefetching(true);
    try {
      const res = await fetch('/api/reporting/overview');
      const body = await res.json().catch(() => ({}));
      if (cancelled()) return;
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setRows(Array.isArray(body.brands) ? body.brands : []);
      setError(null);
    } catch (err) {
      if (cancelled()) return;
      // Keep the last-good rows; the render distinguishes "never loaded" from
      // "failed refresh" so a blip does not wipe the page.
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      if (!cancelled()) { setLoading(false); setRefetching(false); }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => { cancelled = true; };
  }, [load, refreshKey, nonce]);

  const visibleRows = (rows ?? []).filter(row =>
    row.name.toLowerCase().includes(query.trim().toLowerCase()) &&
    (filter === 'all' || (filter === 'ready' ? isReportable(row) : !isReportable(row))),
  );
  const readyCount = (rows ?? []).filter(isReportable).length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold tracking-tight text-foreground">Client reports</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Choose a brand to prepare its next update.</p>
        </div>
        <label className="relative w-full sm:w-56">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <input aria-label="Search reporting brands" placeholder="Find a brand" value={query} onChange={event => setQuery(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" />
        </label>
      </div>
      {rows && <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reporting readiness">
        {([
          ['all', 'All brands', rows.length],
          ['ready', 'Can prepare', readyCount],
          ['review', 'Check data', rows.length - readyCount],
        ] as const).map(([value, label, count]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={cn('rounded-lg px-3 py-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary', filter === value ? 'bg-foreground text-background' : 'bg-card text-muted-foreground hover:bg-secondary')}>
          {label}<span className="ml-2 tabular-nums opacity-70">{count}</span>
        </button>)}
      </div>}

      {error && rows !== null && (
        <div className="flex items-start gap-2 rounded-lg bg-[var(--pulse-warn-bg)] px-3 py-2 text-xs text-[var(--pulse-warn)]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Couldn&apos;t refresh. Showing the last loaded state.</span>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={6} cols={6} title={false} />
      ) : error && rows === null ? (
        <EmptyState
          icon={<AlertCircle className="h-8 w-8 text-[var(--pulse-neg)]" />}
          title="Couldn't load reporting"
          description={error}
          action={
            <Button variant="outline" size="sm" onClick={() => { setLoading(true); setNonce(n => n + 1); }}>
              <RotateCw />
              Try again
            </Button>
          }
        />
      ) : !rows || rows.length === 0 ? (
        <EmptyState
          icon={<Send className="h-8 w-8" />}
          title="No brands to report on"
          description="No brand in your scope has reportable data yet."
        />
      ) : (
        <TableCard className="relative">
          <TableLoadBar active={showBar} />
          <div className={showBar ? 'opacity-60 transition-opacity duration-200' : ''}>
            <div className="overflow-x-auto">
              <Table className="block text-sm md:table">
                <THead className="hidden md:table-header-group">
                  <TR>
                    {HEADERS.map(h => <TH key={h} className="text-left">{h}</TH>)}
                    <TH aria-label="Actions" />
                  </TR>
                </THead>
                <TBody className="block md:table-row-group">
                  {visibleRows.map(r => (
                    <BrandRows key={r.slug} row={r} onGenerate={onGenerate} onChanged={() => setNonce((n) => n + 1)} />
                  ))}
                  {visibleRows.length === 0 && <TR><TD colSpan={4} className="py-10 text-center">No brands match. <button type="button" onClick={() => { setQuery(''); setFilter('all'); }} className="font-semibold text-primary">Clear filters</button></TD></TR>}
                </TBody>
              </Table>
            </div>
          </div>
        </TableCard>
      )}
    </section>
  );
}

function BrandRows({ row, onGenerate, onChanged }: {
  row: ReportingBrandRow;
  onGenerate: (slug: string, name: string) => void;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const reportable = isReportable(row);
  const c = row.coverage;
  const report = row.lastReport;
  const since = report ? daysAgo(report.createdAt) : null;
  const detailId = `report-details-${row.slug}`;
  return <>
    <TR className="grid grid-cols-2 border-b border-border md:table-row md:border-0 hover:bg-muted/30">
      <TD className="col-span-2 border-0 text-left md:border-b">
        <BrandIdentity brand={row.slug} label={row.name} />
      </TD>
      <TD className="border-0 text-left md:border-b">
        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:hidden">Data coverage</span>
        <CoverageMeter coverage={c} />
        {!reportable && <span className="mt-1 block text-[11px] text-[var(--pulse-warn)]">{c.daysPresent === 0 ? 'No data in window' : c.daysBehind !== null && c.daysBehind > MAX_DAYS_BEHIND ? 'Data is out of date' : 'Insufficient coverage'}</span>}
        {reportable && c.missingDays.length > 0 && <span className="mt-1 block text-[11px] text-[var(--pulse-warn)]">{c.missingDays.length} missing day{c.missingDays.length === 1 ? '' : 's'}</span>}
      </TD>
      <TD className="border-0 text-left md:border-b">
        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:hidden">Latest report</span>
        {report ? <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="whitespace-nowrap text-foreground">{shortDate(report.createdAt)}</span>
            <Badge variant={report.revokedAt ? 'negative' : report.viewedAt ? 'positive' : 'neutral'} size="sm">{report.revokedAt ? 'Revoked' : report.viewedAt ? 'Opened' : 'Not opened'}</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">{report.periodLabel || 'Saved report'}{since !== null && since >= 10 ? ` · created ${since}d ago` : ''}</p>
        </div> : <span className="text-xs text-muted-foreground">No saved report</span>}
      </TD>
      <TD className="col-span-2 border-0 pt-1 text-left md:border-b md:pt-3">
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <Button size="sm" variant="outline" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-controls={detailId} aria-label={`Details for ${row.name}`}>
            Details <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
          </Button>
          <Button size="sm" disabled={!reportable} onClick={() => onGenerate(row.slug, row.name)} aria-label={`Prepare report for ${row.name}`}>
            Prepare report
          </Button>
        </div>
      </TD>
    </TR>
    {expanded && <TR className="block md:table-row"><TD colSpan={4} className="block bg-secondary/30 p-4 text-left md:table-cell">
      <div id={detailId} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-foreground">{row.name} · {row.reportCount} saved report{row.reportCount === 1 ? '' : 's'}</p>
          {c.windowStart && c.windowEnd && <span className="text-xs text-muted-foreground">Coverage: {c.windowStart} – {c.windowEnd}</span>}
        </div>
        {c.missingDays.length > 0 && <p className="text-xs leading-relaxed text-[var(--pulse-warn)]">Missing days: {c.missingDays.join(', ')}. Check coverage for your chosen report period before sharing.</p>}
        {report && <div className="flex flex-wrap items-center gap-2">
          {report.url && !report.revokedAt && <a href={`${report.url}?preview=1`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground"><ExternalLink className="h-3.5 w-3.5" />Open latest report</a>}
          {!report.revokedAt && report.shareMessage && <CopyMessage text={report.shareMessage} />}
          {!report.revokedAt && <ReportActions target={{id:report.id,brandName:row.name,periodLabel:report.periodLabel,notes:report.notes,plan:report.plan,viewedAt:report.viewedAt}} onDone={onChanged} />}
        </div>}
        {report && !report.revokedAt && <p className="text-[11px] text-muted-foreground">Revisions create a separate link. The original report stays unchanged.</p>}
      </div>
    </TD></TR>}
  </>;
}

/**
 * Copies the client message for a report that already exists.
 *
 * The drafted message used to live only in the create panel's textarea, which
 * meant it existed for about thirty seconds and then became unreachable. This
 * is the whole reason it could never be sent later or re-sent.
 */
function CopyMessage({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      // Clipboard blocked (insecure context, or permissions). Fall back to a
      // selection the operator can copy by hand rather than failing silently.
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      } catch {
        /* leave it selected */
      }
      document.body.removeChild(ta);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title="Copy the client message for this report"
      className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
      {done ? 'Copied' : 'Message'}
    </button>
  );
}
