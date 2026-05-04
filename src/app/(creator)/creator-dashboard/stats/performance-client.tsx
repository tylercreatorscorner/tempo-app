'use client';

import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, ExternalLink } from 'lucide-react';
import { useMemo } from 'react';
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
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1A1B3A]">Performance</h1>
          <p className="text-sm text-gray-500 mt-1">
            {currentBrandDisplay ? (
              <>Showing <span className="font-medium text-gray-700">{currentBrandDisplay}</span> · last {rangeDays} days</>
            ) : (
              <>All brands · last {rangeDays} days</>
            )}
          </p>
        </div>
        <RangePicker value={rangeDays} onChange={setRange} />
      </motion.div>

      {/* Summary tiles */}
      <motion.div {...fade} transition={{ ...fade.transition, delay: 0.05 }} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Tile label={`GMV (${rangeDays}d)`} value={formatMoney(summary?.totalGmv ?? 0)} changePct={summary?.gmvChangePct ?? null} tone="mint" />
        <Tile label="Orders" value={(summary?.totalOrders ?? 0).toLocaleString()} changePct={summary?.orderChangePct ?? null} />
        <Tile label="Items sold" value={(summary?.totalItemsSold ?? 0).toLocaleString()} />
        <Tile label="Est. commission" value={formatMoney(summary?.totalCommission ?? 0)} tone="mint" />
      </motion.div>

      {/* Daily chart */}
      <motion.section {...fade} transition={{ ...fade.transition, delay: 0.1 }} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-[#1A1B3A] mb-3 text-sm">📈 Daily GMV</h2>
        <DailyChart daily={daily} />
      </motion.section>

      {/* Best day callout */}
      {summary?.bestDay && summary.bestDay.gmv > 0 && (
        <motion.div {...fade} transition={{ ...fade.transition, delay: 0.15 }} className="rounded-2xl p-4 border border-emerald-100 bg-emerald-50/60">
          <p className="text-sm text-emerald-900">
            🏆 <span className="font-semibold">Best day:</span>{' '}
            {formatDate(summary.bestDay.date)} did{' '}
            <span className="font-bold">{formatMoney(summary.bestDay.gmv)}</span>.
          </p>
        </motion.div>
      )}

      {/* Video table */}
      <motion.section {...fade} transition={{ ...fade.transition, delay: 0.2 }} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-[#1A1B3A] text-sm">Videos in this period</h2>
          <span className="text-xs text-gray-400">{topVideos.length} video{topVideos.length === 1 ? '' : 's'}</span>
        </div>
        {topVideos.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">No videos with sales in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <th className="px-5 py-3 font-medium">Video</th>
                  <th className="px-5 py-3 font-medium hidden sm:table-cell">Top product</th>
                  <th className="px-5 py-3 font-medium text-right">GMV</th>
                  <th className="px-5 py-3 font-medium text-right hidden md:table-cell">Orders</th>
                  <th className="px-5 py-3 font-medium text-right hidden md:table-cell">Days</th>
                </tr>
              </thead>
              <tbody>
                {topVideos.map((v) => (
                  <tr key={v.videoId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3 max-w-[280px]">
                      <div className="flex items-center gap-2">
                        {v.videoUrl ? (
                          <a href={v.videoUrl} target="_blank" rel="noopener noreferrer" className="text-[#1A1B3A] hover:text-[#FF4D8D] truncate font-medium flex items-center gap-1">
                            <span className="truncate">{v.videoTitle}</span>
                            <ExternalLink className="h-3 w-3 flex-shrink-0 text-gray-400" />
                          </a>
                        ) : (
                          <span className="text-[#1A1B3A] truncate font-medium">{v.videoTitle}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">@{v.tiktokUsername} · {v.brandSlug}</p>
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell text-gray-500 max-w-[200px]">
                      <span className="truncate block">{v.topProduct ?? '—'}</span>
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-[#34D399]">{formatMoney(v.gmv)}</td>
                    <td className="px-5 py-3 text-right hidden md:table-cell text-gray-700">{v.orders.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right hidden md:table-cell text-gray-500">{v.daysActive}d</td>
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

function RangePicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const opts = [7, 14, 30, 90];
  return (
    <div className="inline-flex bg-gray-100 rounded-lg p-1 text-sm">
      {opts.map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={`px-3 py-1 rounded-md transition-all ${
            value === n ? 'bg-white text-[#1A1B3A] shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {n}d
        </button>
      ))}
    </div>
  );
}

function Tile({
  label,
  value,
  changePct,
  tone,
}: {
  label: string;
  value: string;
  changePct?: number | null;
  tone?: 'mint';
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5 shadow-sm">
      <span className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</span>
      <p className={`text-2xl sm:text-3xl font-extrabold mt-2 ${tone === 'mint' ? 'text-[#34D399]' : 'text-[#1A1B3A]'}`}>
        {value}
      </p>
      {changePct !== undefined && changePct !== null && (
        <p className={`inline-flex items-center gap-1 text-xs font-medium mt-1 ${changePct >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
          {changePct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(changePct).toFixed(0)}%<span className="text-gray-400 ml-1">vs prior</span>
        </p>
      )}
    </div>
  );
}

function DailyChart({ daily }: { daily: CreatorDailyPoint[] }) {
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
      },
      stroke: { curve: 'smooth' as const, width: 3 },
      colors: ['#FF4D8D'],
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.4,
          opacityTo: 0.05,
          stops: [0, 100],
          colorStops: [
            { offset: 0, color: '#FF4D8D', opacity: 0.4 },
            { offset: 100, color: '#7C5CFC', opacity: 0.05 },
          ],
        },
      },
      grid: { borderColor: '#F3F4F6', strokeDashArray: 4 },
      xaxis: {
        type: 'datetime' as const,
        labels: { style: { colors: '#9CA3AF', fontSize: '11px' } },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        labels: {
          style: { colors: '#9CA3AF', fontSize: '11px' },
          formatter: (val: number) =>
            val >= 1000 ? `$${(val / 1000).toFixed(1)}k` : `$${val.toFixed(0)}`,
        },
      },
      tooltip: {
        x: { format: 'MMM d, yyyy' },
        y: { formatter: (val: number) => `$${val.toLocaleString()}` },
      },
      dataLabels: { enabled: false },
    }),
    []
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
