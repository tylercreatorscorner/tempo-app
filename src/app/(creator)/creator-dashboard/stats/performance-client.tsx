'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ExternalLink, Sparkles, TrendingUp } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { TableCard, Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { NumberTicker } from '@/components/ui/number-ticker';
import { RangePicker } from '@/components/creator/range-picker';
import { AreaLineChart } from '@/components/charts/area-line-chart';
import { fmtCompactCurrency, formatCurrency } from '@/components/charts/format';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import type {
  CreatorDailyPoint,
  CreatorSummary,
  CreatorVideoRow,
} from '@/lib/data/creator-portal';

interface Props {
  realName: string;
  currentBrand: string | null;
  currentBrandDisplay: string | null;
  rangeDays: number;
  summary: CreatorSummary | null;
  daily: CreatorDailyPoint[];
  topVideos: CreatorVideoRow[];
}

export function PerformanceClient({
  currentBrandDisplay,
  rangeDays,
  summary,
  daily,
  topVideos,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const brandMeta = useBrandMeta();

  const setRange = (n: number) => {
    const next = new URLSearchParams(params?.toString() ?? '');
    next.set('range', String(n));
    router.push(`/creator-dashboard/stats?${next.toString()}`);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <PageHeader
        eyebrow="Performance"
        title="Performance"
        subtitle={
          currentBrandDisplay ? (
            <>
              Showing <span className="font-medium text-foreground">{currentBrandDisplay}</span> · last {rangeDays} days
            </>
          ) : (
            <>All brands · last {rangeDays} days</>
          )
        }
        actions={<RangePicker value={rangeDays} onChange={setRange} />}
      />

      {/* Summary tiles — canonical Pulse StatCards so the portal matches the admin.
          summary === null means the read FAILED (a zero-activity creator gets a
          zeros object, not null) — show "—", never a fake $0. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          hero
          label={`GMV · ${rangeDays}d`}
          value={summary ? fmtCompactCurrency(summary.totalGmv) : '—'}
          trend={summary?.gmvChangePct ?? undefined}
          trendLabel="vs prior period"
        />
        <StatCard
          label="Orders"
          value={summary ? summary.totalOrders.toLocaleString() : '—'}
          trend={summary?.orderChangePct ?? undefined}
          trendLabel="vs prior period"
        />
        <StatCard
          label="Items sold"
          value={summary ? summary.totalItemsSold.toLocaleString() : '—'}
        />
        <StatCard
          label="Est. commission"
          value={summary ? formatCurrency(summary.totalCommission) : '—'}
          accentColor="var(--pulse-pos)"
        />
      </div>

      {/* Daily chart */}
      <Card>
        <CardHeader>
          <CardTitle>Daily GMV</CardTitle>
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
                <span className="font-extrabold tabular-nums text-[var(--pulse-pos)]">
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
            <CardTitle>Videos in this period</CardTitle>
            <span className="text-xs text-muted-foreground tabular-nums">
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
                  <TR key={v.videoId} className="hover:bg-secondary/50">
                    <TD className="max-w-[280px] align-top">
                      <div className="flex items-center gap-2">
                        {v.videoUrl ? (
                          <a
                            href={v.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground hover:text-primary truncate font-medium flex items-center gap-1"
                          >
                            <span className="truncate">{v.videoTitle}</span>
                            <ExternalLink className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                          </a>
                        ) : (
                          <span className="text-foreground truncate font-medium">{v.videoTitle}</span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">@{v.tiktokUsername}</span>
                        <Chip dotColor={brandMeta.color(v.brandSlug)}>{brandMeta.label(v.brandSlug)}</Chip>
                      </div>
                    </TD>
                    <TD className="hidden sm:table-cell text-left max-w-[200px]">
                      <span className="truncate block">{v.topProduct ?? '—'}</span>
                    </TD>
                    <TD className="font-bold text-[var(--pulse-pos)]">{fmtCompactCurrency(v.gmv)}</TD>
                    <TD className="hidden md:table-cell text-foreground">{v.orders.toLocaleString()}</TD>
                    <TD className="hidden md:table-cell">{v.daysActive}d</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </TableCard>
      )}
    </div>
  );
}

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
