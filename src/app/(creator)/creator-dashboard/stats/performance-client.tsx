'use client';

import { ArrowUpRight, Play, Sparkles, TrendingUp } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { TableCard, Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { NumberTicker } from '@/components/ui/number-ticker';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { AreaLineChart } from '@/components/charts/area-line-chart';
import { fmtCompactCurrency } from '@/components/charts/format';
import { formatCurrency } from '@/lib/utils/format';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { useTikTokThumbnail } from '@/hooks/use-tiktok-thumbnail';
import { cn } from '@/lib/utils';
import type {
  CreatorDailyPoint,
  CreatorSummary,
  CreatorVideoRow,
} from '@/lib/data/creator-portal';

interface Props {
  realName: string;
  currentBrand: string | null;
  currentBrandDisplay: string | null;
  rangeLabel: string;
  summary: CreatorSummary | null;
  daily: CreatorDailyPoint[];
  topVideos: CreatorVideoRow[];
}

export function PerformanceClient({
  currentBrandDisplay,
  rangeLabel,
  summary,
  daily,
  topVideos,
}: Props) {
  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      {/* Ledger page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-ledger text-[13px] italic text-primary">Performance</p>
          <h1 className="font-ledger mt-1 text-[26px] font-bold tracking-tight text-foreground">
            The full record
          </h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            Your GMV, orders, and every video that sold ·{' '}
            {currentBrandDisplay ? (
              <>
                on <span className="font-medium text-foreground">{currentBrandDisplay}</span>
              </>
            ) : (
              'all brands'
            )}{' '}
            · {rangeLabel}
          </p>
        </div>
        <DateRangePicker defaultPreset="last30" />
      </div>

      {/* Ledger KPI strip — summary === null means the read FAILED (a
          zero-activity creator gets a zeros object, not null) — "—", never $0. */}
      <LedgerStrip summary={summary} />

      {/* Daily chart */}
      <Card>
        <CardHeader>
          <CardTitle className="font-ledger text-[15px]">Daily GMV</CardTitle>
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
            {rangeLabel}
          </span>
        </CardHeader>
        <CardContent>
          <DailyChart daily={daily} />
        </CardContent>
      </Card>

      {/* Best day — positive callout. summary.bestDay is only set when there was
          real sales activity, so a null gmv never reaches here as a fake $0. */}
      {summary?.bestDay && summary.bestDay.gmv > 0 && (
        <Card className="border-[var(--pulse-pos)]/25 bg-[var(--pulse-pos-bg)] shadow-[var(--pulse-elev-1)]">
          <CardContent className="flex items-center gap-4 pt-5">
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white"
              style={{ backgroundColor: 'var(--pulse-pos)' }}
            >
              <TrendingUp className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--pulse-pos)]">
                Best day
              </p>
              <p className="mt-1 text-sm text-foreground">
                <span className="font-medium">{formatDate(summary.bestDay.date)}</span> brought in{' '}
                <span className="font-ledger-num text-lg font-bold tabular-nums text-[var(--pulse-pos)]">
                  $<NumberTicker
                    value={summary.bestDay.gmv}
                    className="text-[var(--pulse-pos)] dark:text-[var(--pulse-pos)] tracking-tight"
                  />
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Video table */}
      {topVideos.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="h-8 w-8" />}
          title="No videos with sales yet"
          description="Once your posts start driving sales in this window, every video shows up here with its GMV, orders, and top product. Keep posting — your next hit could be the first row."
        />
      ) : (
        <TableCard>
          <CardHeader>
            <CardTitle className="font-ledger text-[15px]">Videos in this period</CardTitle>
            <span className="text-xs tabular-nums text-muted-foreground">
              {topVideos.length} video{topVideos.length === 1 ? '' : 's'}
            </span>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Video</TH>
                  <TH className="hidden sm:table-cell text-left">Top product</TH>
                  <TH>GMV</TH>
                  <TH className="hidden md:table-cell">Orders</TH>
                  <TH className="hidden md:table-cell">Days</TH>
                </TR>
              </THead>
              <TBody>
                {topVideos.map((v) => (
                  <VideoTableRow
                    key={v.videoId}
                    video={v}
                    cooling={
                      v.priorGmv != null &&
                      v.recentGmv != null &&
                      v.priorGmv >= 200 &&
                      v.recentGmv < v.priorGmv * 0.5
                    }
                  />
                ))}
              </TBody>
            </Table>
          </div>
        </TableCard>
      )}
    </div>
  );
}

// ---- Ledger strip ----------------------------------------------------------

function LedgerStrip({ summary }: { summary: CreatorSummary | null }) {
  const cells: { k: string; v: string; d: number | null }[] = [
    { k: 'GMV', v: summary ? formatCurrency(summary.totalGmv) : '—', d: summary?.gmvChangePct ?? null },
    {
      k: 'Orders',
      v: summary ? summary.totalOrders.toLocaleString('en-US') : '—',
      d: summary?.orderChangePct ?? null,
    },
    { k: 'Items sold', v: summary ? summary.totalItemsSold.toLocaleString('en-US') : '—', d: null },
    { k: 'Est. commission', v: summary ? formatCurrency(summary.totalCommission) : '—', d: null },
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-[var(--pulse-elev-1)] sm:grid-cols-4">
      {cells.map((c) => (
        <div key={c.k} className="bg-card p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{c.k}</p>
          <p className="font-ledger-num mt-1.5 text-xl font-bold text-foreground sm:text-[23px]">{c.v}</p>
          {c.d != null && (
            <p
              className="mt-1 font-mono text-[11px] tabular-nums"
              style={{ color: c.d >= 0 ? 'var(--pulse-pos)' : 'var(--pulse-neg)' }}
            >
              {c.d >= 0 ? '▲' : '▼'} {Math.abs(Math.round(c.d))}% vs prior
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ---- Video row (with thumbnail) -------------------------------------------

function VideoTableRow({ video: v, cooling }: { video: CreatorVideoRow; cooling: boolean }) {
  const brandMeta = useBrandMeta();
  const { thumbnail, loading } = useTikTokThumbnail(v.videoUrl);

  const thumb = (
    <span className="relative block h-[46px] w-9 shrink-0 overflow-hidden rounded-md border border-border bg-secondary">
      {thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span
          className={cn(
            'grid h-full w-full place-items-center text-muted-foreground/50',
            loading && 'animate-pulse',
          )}
        >
          <Play className="h-3 w-3 fill-current" />
        </span>
      )}
    </span>
  );

  return (
    <TR className="hover:bg-secondary/50">
      <TD className="max-w-[300px] align-top">
        <div className="flex items-center gap-2.5">
          {v.videoUrl ? (
            <a href={v.videoUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
              {thumb}
            </a>
          ) : (
            thumb
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {v.videoUrl ? (
                <a
                  href={v.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 items-center gap-1 font-medium text-foreground transition-colors hover:text-primary"
                >
                  <span className="truncate">{v.videoTitle}</span>
                  <ArrowUpRight className="h-3 w-3 flex-shrink-0 text-muted-foreground/50" />
                </a>
              ) : (
                <span className="truncate font-medium text-foreground">{v.videoTitle}</span>
              )}
              {cooling && (
                <span className="flex-shrink-0">
                  <Badge variant="warning" size="sm">
                    Cooling
                  </Badge>
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">@{v.tiktokUsername}</span>
              <Chip dotColor={brandMeta.color(v.brandSlug)}>{brandMeta.label(v.brandSlug)}</Chip>
            </div>
          </div>
        </div>
      </TD>
      <TD className="hidden max-w-[200px] text-left sm:table-cell">
        <span className="block truncate">{v.topProduct ?? '—'}</span>
      </TD>
      <TD className="font-bold tabular-nums text-[var(--pulse-pos)]">{formatCurrency(v.gmv)}</TD>
      <TD className="hidden tabular-nums text-foreground md:table-cell">{v.orders.toLocaleString()}</TD>
      <TD className="hidden md:table-cell">{v.daysActive}d</TD>
    </TR>
  );
}

// ---- Chart -----------------------------------------------------------------

/**
 * Daily GMV trend. Uses the shared index-based AreaLineChart (same component as
 * the admin dashboard) rather than ApexCharts' datetime axis — the datetime axis
 * picks its own "nice" tick boundaries and drops the last label short of the
 * final data point, which read as "data stops mid-month." Index-based points +
 * first/last date labels can't drift out of alignment.
 */
function DailyChart({ daily }: { daily: CreatorDailyPoint[] }) {
  const labels = daily.map((d) => formatDate(d.date));
  const series = [{ name: 'GMV', data: daily.map((d) => Number(d.gmv.toFixed(2))) }];
  return <AreaLineChart labels={labels} series={series} height={280} showAxis format={fmtCompactCurrency} />;
}

function formatDate(s: string): string {
  const d = new Date(s + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
