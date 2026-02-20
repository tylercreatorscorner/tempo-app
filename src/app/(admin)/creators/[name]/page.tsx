import { Suspense } from 'react';
import { getCreatorRankings, getVideoSummary, getProductSummary, getDailyTrend } from '@/lib/data/rpc';
import { resolveDateRange } from '@/lib/data/date-utils';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { BRAND_COLORS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import { StatCard } from '@/components/dashboard/stat-card';
import { GmvTrendChart } from '@/components/dashboard/gmv-trend-chart';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { format } from 'date-fns';
import Link from 'next/link';
import { ArrowLeft, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const BRANDS = ['jiyu', 'catakor', 'physicians_choice', 'toplux'] as const;

interface Props {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ range?: string }>;
}

export default async function CreatorDetailPage({ params, searchParams }: Props) {
  const { name } = await params;
  const creatorName = decodeURIComponent(name);
  const sp = await searchParams;
  const { startDate, endDate } = resolveDateRange(sp.range);

  const [allCreatorData, allVideos, allProducts, allTrends] = await Promise.all([
    Promise.all(
      BRANDS.map(async (brand) => {
        try {
          const data = await getCreatorRankings(brand, startDate, endDate, 500);
          return data.filter((c) => c.creator_name === creatorName).map((c) => ({ ...c, brand }));
        } catch { return []; }
      })
    ).then((r) => r.flat()),
    Promise.all(
      BRANDS.map(async (brand) => {
        try {
          const data = await getVideoSummary(brand, startDate, endDate, 500);
          return data.filter((v) => v.creator_name === creatorName).map((v) => ({ ...v, brand }));
        } catch { return []; }
      })
    ).then((r) => r.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0))),
    Promise.all(
      BRANDS.map(async (brand) => {
        try {
          const data = await getProductSummary(brand, startDate, endDate, 500);
          return data.map((p) => ({ ...p, brand }));
        } catch { return []; }
      })
    ).then((r) => r.flat()),
    Promise.all(
      BRANDS.map(async (brand) => {
        try {
          return { brand, data: await getDailyTrend(brand, startDate, endDate) };
        } catch { return { brand, data: [] }; }
      })
    ),
  ]);

  const totalGmv = allCreatorData.reduce((s, c) => s + (c.total_gmv ?? 0), 0);
  const totalOrders = allCreatorData.reduce((s, c) => s + (c.total_orders ?? 0), 0);
  const totalItems = allCreatorData.reduce((s, c) => s + (c.total_items_sold ?? 0), 0);
  const totalVideos = allCreatorData.reduce((s, c) => s + (c.days_active ?? 0), 0);
  const activeBrands = allCreatorData.map((c) => c.brand);

  const dateMap = new Map<string, Record<string, number>>();
  for (const { brand, data } of allTrends) {
    if (!activeBrands.includes(brand)) continue;
    for (const row of data) {
      const d = row.report_date;
      if (!dateMap.has(d)) dateMap.set(d, {});
      const entry = dateMap.get(d)!;
      entry[brand] = (entry[brand] ?? 0) + (row.daily_gmv ?? 0);
    }
  }
  const chartData = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date: format(new Date(date), 'MMM d'),
      ...Object.fromEntries(activeBrands.map((b) => [b, values[b] ?? 0])),
    }));

  const brandBreakdown = allCreatorData.map((c) => ({
    brand: c.brand,
    gmv: c.total_gmv ?? 0,
    orders: c.total_orders ?? 0,
    items: c.total_items_sold ?? 0,
    videos: c.days_active ?? 0,
  })).sort((a, b) => b.gmv - a.gmv);

  const creatorProductNames = new Set(allVideos.map((v) => v.video_title));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/creators" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <div className="h-10 w-10 rounded-full bg-pink-50 border border-pink-100 flex items-center justify-center">
            <User className="h-5 w-5 text-[#FF4D8D]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#1A1B3A]">{creatorName}</h1>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {activeBrands.map((b) => (
                <span
                  key={b}
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: `${BRAND_COLORS[b]}15`, color: BRAND_COLORS[b] }}
                >
                  {BRAND_DISPLAY_NAMES[b] ?? b}
                </span>
              ))}
            </div>
          </div>
        </div>
        <Suspense fallback={null}>
          <DateRangePicker />
        </Suspense>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total GMV" value={formatCurrency(totalGmv)} />
        <StatCard label="Orders" value={formatNumber(totalOrders)} />
        <StatCard label="Items Sold" value={formatNumber(totalItems)} />
        <StatCard label="Videos" value={formatNumber(totalVideos)} />
      </div>

      {brandBreakdown.length > 1 && (
        <div className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-bold tracking-tight text-[#1A1B3A]">Brand Breakdown</h3>
            <p className="text-xs text-gray-400 mt-0.5">Performance split across brands</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="px-4 sm:px-6 py-3 text-left font-medium text-xs uppercase tracking-wider">Brand</th>
                  <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider">GMV</th>
                  <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider">Orders</th>
                  <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider">Items</th>
                  <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider pr-6">Videos</th>
                </tr>
              </thead>
              <tbody>
                {brandBreakdown.map((b) => (
                  <tr key={b.brand} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 sm:px-6 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: BRAND_COLORS[b.brand] }} />
                        <span className="font-medium text-[#1A1B3A]">{BRAND_DISPLAY_NAMES[b.brand] ?? b.brand}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-[#1A1B3A]">{formatCurrency(b.gmv)}</td>
                    <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums">{formatNumber(b.orders)}</td>
                    <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums">{formatNumber(b.items)}</td>
                    <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums pr-6">{formatNumber(b.videos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {chartData.length > 0 && (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 sm:p-6">
          <h3 className="text-lg font-bold tracking-tight text-[#1A1B3A] mb-1">GMV Trend</h3>
          <p className="text-xs text-gray-400 mb-4">Daily revenue for {creatorName}&apos;s active brands</p>
          <GmvTrendChart data={chartData} brands={[...new Set(activeBrands)]} />
        </div>
      )}

      <div className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold tracking-tight text-[#1A1B3A]">Video Performance</h3>
          <p className="text-xs text-gray-400 mt-0.5">{allVideos.length} videos</p>
        </div>
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr className="border-b border-gray-100 text-gray-500">
                <th className="px-4 sm:px-6 py-3 text-left font-medium text-xs uppercase tracking-wider w-12">#</th>
                <th className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wider">Video</th>
                <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider">GMV</th>
                <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider">Views</th>
                <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider pr-6">Orders</th>
              </tr>
            </thead>
            <tbody>
              {allVideos.map((v, i) => (
                <tr key={i} className={cn(
                  'border-b border-gray-50 transition-all duration-200',
                  'hover:bg-gray-50',
                )}>
                  <td className="px-4 sm:px-6 py-3.5 text-gray-400 text-sm tabular-nums">{i + 1}</td>
                  <td className="px-4 py-3.5 font-medium max-w-xs truncate text-[#1A1B3A]">{v.video_title || 'Untitled'}</td>
                  <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-[#1A1B3A]">{formatCurrency(v.total_gmv)}</td>
                  <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums">{v.days_active != null ? formatNumber(v.days_active) : '-'}</td>
                  <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums pr-6">{formatNumber(v.total_orders)}</td>
                </tr>
              ))}
              {allVideos.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">No video data for this creator</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
