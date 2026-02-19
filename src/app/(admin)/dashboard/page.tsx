import { Suspense } from 'react';
import { getBrandSummary, getCreatorRankings, getProductSummary, getVideoSummary, getDailyTrend } from '@/lib/data/rpc';
import { resolveDateRange } from '@/lib/data/date-utils';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { StatCard } from '@/components/dashboard/stat-card';
import { BrandPerformanceStrip } from '@/components/dashboard/brand-performance-strip';
import { GmvTrendChart } from '@/components/dashboard/gmv-trend-chart';
import { CreatorTable } from '@/components/dashboard/creator-table';
import { ProductTable } from '@/components/dashboard/product-table';
import { VideoTable } from '@/components/dashboard/video-table';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { format } from 'date-fns';

const BRANDS = ['jiyu', 'catakor', 'physicians_choice', 'toplux'] as const;

interface Props {
  searchParams: Promise<{ range?: string }>;
}

export default async function AdminDashboard({ searchParams }: Props) {
  const params = await searchParams;
  const { startDate, endDate } = resolveDateRange(params.range);

  // Fetch all brand summaries in parallel
  const summaries = await Promise.all(
    BRANDS.map(async (brand) => {
      try {
        const data = await getBrandSummary(brand, startDate, endDate);
        return { brand, data: data[0] ?? null };
      } catch {
        return { brand, data: null };
      }
    })
  );

  // Fetch creators, products, videos across all brands, merge & sort
  const [allCreators, allProducts, allVideos, allTrends] = await Promise.all([
    Promise.all(
      BRANDS.map(async (brand) => {
        try { return await getCreatorRankings(brand, startDate, endDate, 20); } catch { return []; }
      })
    ).then((results) =>
      results.flat().sort((a, b) => b.total_gmv - a.total_gmv).slice(0, 20)
    ),
    Promise.all(
      BRANDS.map(async (brand) => {
        try { return await getProductSummary(brand, startDate, endDate, 20); } catch { return []; }
      })
    ).then((results) =>
      results.flat().sort((a, b) => b.total_gmv - a.total_gmv).slice(0, 20)
    ),
    Promise.all(
      BRANDS.map(async (brand) => {
        try { return await getVideoSummary(brand, startDate, endDate, 20); } catch { return []; }
      })
    ).then((results) =>
      results.flat().sort((a, b) => b.total_gmv - a.total_gmv).slice(0, 20)
    ),
    Promise.all(
      BRANDS.map(async (brand) => {
        try { return { brand, data: await getDailyTrend(brand, startDate, endDate) }; } catch { return { brand, data: [] }; }
      })
    ),
  ]);

  // Aggregate portfolio totals
  const totals = summaries.reduce(
    (acc, { data }) => {
      if (!data) return acc;
      acc.gmv += data.total_gmv ?? 0;
      acc.orders += data.total_orders ?? 0;
      acc.items += data.total_items_sold ?? 0;
      acc.creators += data.unique_creators ?? 0;
      acc.videos += data.unique_videos ?? 0;
      return acc;
    },
    { gmv: 0, orders: 0, items: 0, creators: 0, videos: 0 }
  );

  const avgGmvPerCreator = totals.creators > 0 ? totals.gmv / totals.creators : 0;

  // Build brand strip data
  const brandStripData = BRANDS.map((brand) => {
    const s = summaries.find((x) => x.brand === brand);
    return { brand, gmv: s?.data?.total_gmv ?? 0 };
  });

  // Build chart data: merge all brand trends by date
  const dateMap = new Map<string, Record<string, number>>();
  for (const { brand, data } of allTrends) {
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
      ...Object.fromEntries(BRANDS.map((b) => [b, values[b] ?? 0])),
    }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Operations Center</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Portfolio performance overview
          </p>
        </div>
        <Suspense fallback={null}>
          <DateRangePicker />
        </Suspense>
      </div>

      {/* Portfolio Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 stagger-children">
        <StatCard label="Total GMV" value={formatCurrency(totals.gmv)} />
        <StatCard label="Orders" value={formatNumber(totals.orders)} />
        <StatCard label="Items Sold" value={formatNumber(totals.items)} />
        <StatCard label="Active Creators" value={formatNumber(totals.creators)} />
        <StatCard label="Videos" value={formatNumber(totals.videos)} />
        <StatCard label="Avg GMV/Creator" value={formatCurrency(avgGmvPerCreator)} />
      </div>

      {/* Brand Performance Strip */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Brand Performance</h2>
        <BrandPerformanceStrip brands={brandStripData} />
      </div>

      {/* GMV Trend Chart */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold mb-4">GMV Trend</h3>
        <GmvTrendChart data={chartData} brands={[...BRANDS]} />
      </div>

      {/* Tables */}
      <CreatorTable creators={allCreators} />
      <ProductTable products={allProducts} />
      <VideoTable videos={allVideos} />
    </div>
  );
}
