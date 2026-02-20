import { Suspense } from 'react';
import { getBrandSummary, getCreatorRankings, getProductSummary, getVideoSummary, getDailyTrend } from '@/lib/data/rpc';
import { resolveDateRange } from '@/lib/data/date-utils';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { GmvTrendChart } from '@/components/dashboard/gmv-trend-chart';
import { AnalyticsCharts } from '@/components/dashboard/analytics-charts';
import { format } from 'date-fns';

const BRANDS = ['jiyu', 'catakor', 'physicians_choice', 'toplux'] as const;

interface Props {
  searchParams: Promise<{ range?: string }>;
}

export default async function AnalyticsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { startDate, endDate } = resolveDateRange(params.range);

  const [allTrends, allCreators, allProducts, allVideos, summaries] = await Promise.all([
    Promise.all(
      BRANDS.map(async (brand) => {
        try { return { brand, data: await getDailyTrend(brand, startDate, endDate) }; }
        catch { return { brand, data: [] }; }
      })
    ),
    Promise.all(
      BRANDS.map(async (brand) => {
        try {
          const data = await getCreatorRankings(brand, startDate, endDate, 50);
          return data.map((c) => ({ ...c, brand }));
        } catch { return []; }
      })
    ).then((r) => r.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0))),
    Promise.all(
      BRANDS.map(async (brand) => {
        try {
          const data = await getProductSummary(brand, startDate, endDate, 30);
          return data.map((p) => ({ ...p, brand }));
        } catch { return []; }
      })
    ).then((r) => r.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0)).slice(0, 20)),
    Promise.all(
      BRANDS.map(async (brand) => {
        try {
          const data = await getVideoSummary(brand, startDate, endDate, 50);
          return data.map((v) => ({ ...v, brand }));
        } catch { return []; }
      })
    ).then((r) => r.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0))),
    Promise.all(
      BRANDS.map(async (brand) => {
        try {
          const data = await getBrandSummary(brand, startDate, endDate);
          return { brand, data: data[0] ?? null };
        } catch { return { brand, data: null }; }
      })
    ),
  ]);

  // Build GMV trend chart data
  const dateMap = new Map<string, Record<string, number>>();
  for (const { brand, data } of allTrends) {
    for (const row of data) {
      const d = row.report_date;
      if (!dateMap.has(d)) dateMap.set(d, {});
      const entry = dateMap.get(d)!;
      entry[brand] = (entry[brand] ?? 0) + (row.daily_gmv ?? 0);
    }
  }
  const gmvChartData = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date: format(new Date(date), 'MMM d'),
      ...Object.fromEntries(BRANDS.map((b) => [b, values[b] ?? 0])),
    }));

  // Creator growth by brand (unique creators per brand)
  const creatorGrowthData = summaries
    .filter((s) => s.data)
    .map((s) => ({
      brand: BRAND_DISPLAY_NAMES[s.brand] ?? s.brand,
      brandKey: s.brand,
      creators: s.data!.unique_creators ?? 0,
      videos: s.data!.total_videos ?? 0,
    }));

  // Product rankings top 15
  const productRankings = allProducts.slice(0, 15).map((p) => ({
    name: p.product_name.length > 30 ? p.product_name.slice(0, 30) + '…' : p.product_name,
    gmv: p.total_gmv ?? 0,
    orders: p.total_orders ?? 0,
    brand: p.brand,
  }));

  // Video GMV distribution buckets
  const videoBuckets = [
    { range: '$0', min: 0, max: 0.01 },
    { range: '$0-10', min: 0.01, max: 10 },
    { range: '$10-50', min: 10, max: 50 },
    { range: '$50-100', min: 50, max: 100 },
    { range: '$100-500', min: 100, max: 500 },
    { range: '$500+', min: 500, max: Infinity },
  ];
  const videoDistribution = videoBuckets.map((bucket) => ({
    range: bucket.range,
    count: allVideos.filter((v) => (v.total_gmv ?? 0) >= bucket.min && (v.total_gmv ?? 0) < bucket.max).length,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Deep performance insights across the portfolio
          </p>
        </div>
        <Suspense fallback={null}>
          <DateRangePicker />
        </Suspense>
      </div>

      {/* GMV over time per brand */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold mb-4">GMV Over Time by Brand</h3>
        <GmvTrendChart data={gmvChartData} brands={[...BRANDS]} />
      </div>

      {/* Client-side interactive charts */}
      <AnalyticsCharts
        creatorGrowthData={creatorGrowthData}
        productRankings={productRankings}
        videoDistribution={videoDistribution}
      />

      {/* Top creators across all brands */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="text-lg font-semibold">Top 20 Creators (All Brands)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium w-12">#</th>
                <th className="px-4 py-3 text-left font-medium">Creator</th>
                <th className="px-4 py-3 text-left font-medium">Brand</th>
                <th className="px-4 py-3 text-right font-medium">GMV</th>
                <th className="px-4 py-3 text-right font-medium">Orders</th>
                <th className="px-4 py-3 text-right font-medium">Days Active</th>
              </tr>
            </thead>
            <tbody>
              {allCreators.slice(0, 20).map((c, i) => (
                <tr key={`${c.creator_name}-${c.brand}-${i}`} className="border-b border-border/50 hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-3 font-medium">{c.creator_name}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: `${BRAND_DISPLAY_NAMES[c.brand] ? 'rgba(255,255,255,0.1)' : 'transparent'}` }}>
                      {BRAND_DISPLAY_NAMES[c.brand] ?? c.brand}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(c.total_gmv)}</td>
                  <td className="px-4 py-3 text-right">{formatNumber(c.total_orders)}</td>
                  <td className="px-4 py-3 text-right">{formatNumber(c.days_active)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
