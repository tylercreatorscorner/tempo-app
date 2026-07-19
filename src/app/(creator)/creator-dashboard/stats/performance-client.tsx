'use client';

import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTheme } from 'next-themes';
import { StatCard } from '@/components/ui/stat-card';
import { RangePicker } from '@/components/creator/range-picker';
import type {
  CreatorDailyPoint,
  CreatorSummary,
  CreatorVideoRow,
} from '@/lib/data/creator-portal';

// ApexCharts is client-only
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

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

  const setRange = (n: number) => {
    const next = new URLSearchParams(params?.toString() ?? '');
    next.set('range', String(n));
    router.push(`/creator-dashboard/stats?${next.toString()}`);
  };

  const fade = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, ease: 'easeOut' as const },
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <motion.div {...fade} className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Performance</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {currentBrandDisplay ? (
              <>Showing <span className="font-medium text-foreground">{currentBrandDisplay}</span> · last {rangeDays} days</>
            ) : (
              <>All brands · last {rangeDays} days</>
            )}
          </p>
        </div>
        <RangePicker value={rangeDays} onChange={setRange} />
      </motion.div>

      {/* Summary tiles — canonical Pulse StatCards so the portal matches the admin.
          summary === null means the read FAILED (a zero-activity creator gets a
          zeros object, not null) — show "—", never a fake $0. */}
      <motion.div {...fade} transition={{ ...fade.transition, delay: 0.05 }} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          hero
          label={`GMV · ${rangeDays}d`}
          value={summary ? formatMoney(summary.totalGmv) : '—'}
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
          value={summary ? formatMoney(summary.totalCommission) : '—'}
          accentColor="var(--pulse-pos)"
        />
      </motion.div>

      {/* Daily chart */}
      <motion.section {...fade} transition={{ ...fade.transition, delay: 0.1 }} className="bg-card border border-border rounded-2xl p-5 shadow-[var(--pulse-elev-1)]">
        <h2 className="font-semibold text-foreground mb-3 text-sm">📈 Daily GMV</h2>
        <DailyChart daily={daily} />
      </motion.section>

      {/* Best day callout */}
      {summary?.bestDay && summary.bestDay.gmv > 0 && (
        <motion.div {...fade} transition={{ ...fade.transition, delay: 0.15 }} className="rounded-2xl p-4 border border-border bg-[var(--pulse-pos-bg)]">
          <p className="text-sm text-foreground">
            🏆 <span className="font-semibold">Best day:</span>{' '}
            {formatDate(summary.bestDay.date)} did{' '}
            <span className="font-bold text-[var(--pulse-pos)]">{formatMoney(summary.bestDay.gmv)}</span>.
          </p>
        </motion.div>
      )}

      {/* Video table */}
      <motion.section {...fade} transition={{ ...fade.transition, delay: 0.2 }} className="bg-card border border-border rounded-2xl shadow-[var(--pulse-elev-1)] overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-foreground text-sm">Videos in this period</h2>
          <span className="text-xs text-muted-foreground">{topVideos.length} video{topVideos.length === 1 ? '' : 's'}</span>
        </div>
        {topVideos.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground text-center">No videos with sales in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="px-5 py-3 font-medium">Video</th>
                  <th className="px-5 py-3 font-medium hidden sm:table-cell">Top product</th>
                  <th className="px-5 py-3 font-medium text-right">GMV</th>
                  <th className="px-5 py-3 font-medium text-right hidden md:table-cell">Orders</th>
                  <th className="px-5 py-3 font-medium text-right hidden md:table-cell">Days</th>
                </tr>
              </thead>
              <tbody>
                {topVideos.map((v) => (
                  <tr key={v.videoId} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors">
                    <td className="px-5 py-3 max-w-[280px]">
                      <div className="flex items-center gap-2">
                        {v.videoUrl ? (
                          <a href={v.videoUrl} target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-primary truncate font-medium flex items-center gap-1">
                            <span className="truncate">{v.videoTitle}</span>
                            <ExternalLink className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                          </a>
                        ) : (
                          <span className="text-foreground truncate font-medium">{v.videoTitle}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">@{v.tiktokUsername} · {v.brandSlug}</p>
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell text-muted-foreground max-w-[200px]">
                      <span className="truncate block">{v.topProduct ?? '—'}</span>
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-[var(--pulse-pos)]">{formatMoney(v.gmv)}</td>
                    <td className="px-5 py-3 text-right hidden md:table-cell text-foreground">{v.orders.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right hidden md:table-cell text-muted-foreground">{v.daysActive}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>
    </div>
  );
}

/**
 * ApexCharts needs concrete hex strings, not CSS vars, so we resolve the Pulse
 * tokens off the document root and recompute whenever the theme flips. Falls
 * back to the light-mode token values before the first client read.
 */
function useChartColors() {
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = useState({
    primary: '#4B45FF',
    accent2: '#9A37EF',
    pos: '#12A150',
    muted: '#6D6A8B',
    border: '#E8E5F3',
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cs = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    setColors({
      primary: read('--primary', '#4B45FF'),
      accent2: read('--pulse-accent-2', '#9A37EF'),
      pos: read('--pulse-pos', '#12A150'),
      muted: read('--muted-foreground', '#6D6A8B'),
      border: read('--border', '#E8E5F3'),
    });
  }, [resolvedTheme]);

  return { colors, isDark: resolvedTheme === 'dark' };
}

function DailyChart({ daily }: { daily: CreatorDailyPoint[] }) {
  const { colors, isDark } = useChartColors();

  const series = useMemo(
    () => [
      { name: 'GMV', data: daily.map((d) => ({ x: d.date, y: Number(d.gmv.toFixed(2)) })) },
    ],
    [daily]
  );
  const options = useMemo(
    () => ({
      chart: {
        type: 'area' as const,
        toolbar: { show: false },
        sparkline: { enabled: false },
        animations: { enabled: true, speed: 600 },
        background: 'transparent',
      },
      stroke: { curve: 'smooth' as const, width: 3 },
      colors: [colors.primary],
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.4,
          opacityTo: 0.05,
          stops: [0, 100],
          colorStops: [
            { offset: 0, color: colors.primary, opacity: 0.4 },
            { offset: 100, color: colors.accent2, opacity: 0.05 },
          ],
        },
      },
      grid: { borderColor: colors.border, strokeDashArray: 4 },
      xaxis: {
        type: 'datetime' as const,
        labels: { style: { colors: colors.muted, fontSize: '11px' } },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        labels: {
          style: { colors: colors.muted, fontSize: '11px' },
          formatter: (val: number) =>
            val >= 1000 ? `$${(val / 1000).toFixed(1)}k` : `$${val.toFixed(0)}`,
        },
      },
      tooltip: {
        theme: isDark ? 'dark' : 'light',
        x: { format: 'MMM d, yyyy' },
        y: { formatter: (val: number) => `$${val.toLocaleString()}` },
      },
      dataLabels: { enabled: false },
    }),
    [colors, isDark]
  );
  return <Chart options={options as any} series={series} type="area" height={280} />;
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function formatDate(s: string): string {
  const d = new Date(s + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
