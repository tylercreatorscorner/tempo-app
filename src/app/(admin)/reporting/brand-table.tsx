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
import { AlertCircle, RotateCw, Send, Wand2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableCard, Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { TableLoadBar } from '@/components/ui/table-load-bar';
import { TableSkeleton } from '@/components/ui/page-skeletons';
import { EmptyState } from '@/components/ui/empty-state';

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
    createdAt: string;
    periodLabel: string | null;
    viewedAt: string | null;
    revokedAt: string | null;
    url: string | null;
    token: string;
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
    <div className="flex items-center gap-2.5">
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
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {daysPresent} / {daysExpected}
      </span>
    </div>
  );
}

const HEADERS = ['Brand', `Data coverage`, 'Last report', 'Client opened', 'Reports'] as const;

export function BrandTable({
  refreshKey, onGenerate,
}: {
  refreshKey: number;
  onGenerate: (slug: string, name: string) => void;
}) {
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

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-bold tracking-tight text-foreground">Client reporting</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Who is owed a report, and whether the data can honestly support one.
        </p>
      </div>

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
              <Table className="text-sm">
                <THead>
                  <TR>
                    {HEADERS.map(h => <TH key={h} className="text-left">{h}</TH>)}
                    <TH aria-label="Actions" />
                  </TR>
                </THead>
                <TBody>
                  {rows.map(r => (
                    <BrandRows key={r.slug} row={r} onGenerate={onGenerate} />
                  ))}
                </TBody>
              </Table>
            </div>
          </div>
        </TableCard>
      )}
    </section>
  );
}

function BrandRows({
  row, onGenerate,
}: { row: ReportingBrandRow; onGenerate: (slug: string, name: string) => void }) {
  const reportable = isReportable(row);
  const c = row.coverage;
  const since = row.lastReport ? daysAgo(row.lastReport.createdAt) : null;

  return (
    <>
      <TR className="hover:bg-muted/60">
        <TD className="text-left">
          <span className="inline-flex items-center gap-2 font-semibold text-foreground">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-[3px]" style={{ backgroundColor: row.color }} />
            {row.name}
          </span>
        </TD>
        <TD className="text-left"><CoverageMeter coverage={c} /></TD>
        <TD className="text-left text-xs">
          {row.lastReport ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="tabular-nums text-foreground">{shortDate(row.lastReport.createdAt)}</span>
              {since !== null && since >= 10 && (
                <Badge variant="neutral" size="sm">{since}d ago</Badge>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">Never</span>
          )}
        </TD>
        <TD className="text-left">
          {!row.lastReport ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : row.lastReport.revokedAt ? (
            <Badge variant="negative" size="sm">Revoked</Badge>
          ) : row.lastReport.viewedAt ? (
            <Badge variant="positive" size="sm">Opened</Badge>
          ) : (
            <Badge variant="warning" size="sm">Not opened</Badge>
          )}
        </TD>
        <TD className="text-left tabular-nums text-xs">{row.reportCount}</TD>
        <TD className="py-2">
          <div className="flex items-center justify-end gap-1">
            {row.lastReport?.url && (
              <a
                href={`${row.lastReport.url}?preview=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Last
              </a>
            )}
            {reportable ? (
              <Button size="sm" onClick={() => onGenerate(row.slug, row.name)}>
                <Wand2 />
                Generate
              </Button>
            ) : (
              <Badge variant="negative" size="sm">
                {c.daysPresent === 0
                  ? 'No data in window'
                  : c.lastDataDay
                    ? `Stale since ${c.lastDataDay}`
                    : 'Not reportable'}
              </Badge>
            )}
          </div>
        </TD>
      </TR>

      {/* Gaps get their own line under the brand, naming the exact days. A
          report generated over a partial window reads as a decline the brand
          did not have. */}
      {reportable && c.missingDays.length > 0 && (
        <TR>
          <TD colSpan={6} className="bg-[var(--pulse-warn-bg)] px-4 py-2 text-left text-[11.5px] text-[var(--pulse-warn)]">
            <strong>{row.name} is missing {c.missingDays.length} day{c.missingDays.length === 1 ? '' : 's'}</strong>
            {' '}in this window ({c.missingDays.join(', ')}). A report spanning them compares an
            incomplete period against a full one.
          </TD>
        </TR>
      )}
    </>
  );
}
