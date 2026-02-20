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
import { DailyBrief } from '@/components/dashboard/daily-brief';
import { BrandFilterBar } from '@/components/dashboard/brand-filter-bar';
import { AlertBanners } from '@/components/dashboard/alert-banners';
import { generateAlerts } from '@/lib/data/alerts';
import { format, subDays, differenceInDays } from 'date-fns';

const ALL_BRANDS = ['jiyu', 'catakor', 'physicians_choice', 'toplux'] as const;

interface Props {
  searchParams: Promise<{ range?: string; brand?: string }>;
}

export default async function AdminDashboard({ searchParams }: Props) {
  const params = await searchParams;
  const { startDate, endDate } = resolveDateRange(params.range);
  const brandFilter = params.brand && ALL_BRANDS.includes(params.brand as typeof ALL_BRANDS[number])
    ? params.brand
    : null;

  // Brands to fetch data for
  const activeBrands = brandFilter ? [brandFilter] as const : ALL_BRANDS;

  // Calculate previous period for comparison
  const start = new Date(startDate);
  const end = new Date(endDate);
  const periodLength = differenceInDays(end, start) + 1;
  const prevEnd = subDays(start, 1);
  const prevStart = subDays(prevEnd, periodLength - 1);
  const prevStartDate = format(prevStart, 'yyyy-MM-dd');
  const prevEndDate = format(prevEnd, 'yyyy-MM-dd');

  // Yesterday for Daily Brief
  const yesterday = subDays(new Date(), 1);
  const yesterdayStr = format(yesterday, 'yyyy-MM-dd');

  // Fetch all brand summaries in parallel (current + previous + yesterday)
  // Always fetch ALL brands for alerts even when filtering
  const [summaries, prevSummaries, yesterdaySummaries, allBrandSummaries, allBrandPrevSummaries] = await Promise.all([
    Promise.all(
      activeBrands.map(async (brand) => {
        try {
          const data = await getBrandSummary(brand, startDate, endDate);
          return { brand, data: data[0] ?? null };
        } catch (err) {
          console.error(`getBrandSummary(${brand}) failed:`, err);
          return { brand, data: null };
        }
      })
    ),
    Promise.all(
      activeBrands.map(async (brand) => {
        try {
          const data = await getBrandSummary(brand, prevStartDate, prevEndDate);
          return { brand, data: data[0] ?? null };
        } catch (err) {
          console.error(`getBrandSummary prev(${brand}) failed:`, err);
          return { brand, data: null };
        }
      })
    ),
    Promise.all(
      activeBrands.map(async (brand) => {
        try {
          const data = await getBrandSummary(brand, yesterdayStr, yesterdayStr);
          return { brand, data: data[0] ?? null };
        } catch (err) {
          console.error(`getBrandSummary yesterday(${brand}) failed:`, err);
          return { brand, data: null };
        }
      })
    ),
    // For alerts: always fetch all brands
    brandFilter
      ? Promise.all(
          ALL_BRANDS.map(async (brand) => {
            try {
              const data = await getBrandSummary(brand, startDate, endDate);
              return { brand, data: data[0] ?? null };
            } catch (err) {
              return { brand, data: null };
            }
          })
        )
      : Promise.resolve(null), // null = reuse summaries
    brandFilter
      ? Promise.all(
          ALL_BRANDS.map(async (brand) => {
            try {
              const data = await getBrandSummary(brand, prevStartDate, prevEndDate);
              return { brand, data: data[0] ?? null };
            } catch (err) {
              return { brand, data: null };
            }
          })
        )
      : Promise.resolve(null),
  ]);

  // Fetch creators, products, videos, trends
  const [allCreators, allProducts, allVideos, allTrends] = await Promise.all([
    Promise.all(
      activeBrands.map(async (brand) => {
        try { return await getCreatorRankings(brand, startDate, endDate, 20); } catch { return []; }
      })
    ).then((results) =>
      results.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0)).slice(0, 20)
    ),
    Promise.all(
      activeBrands.map(async (brand) => {
        try { return await getProductSummary(brand, startDate, endDate, 20); } catch { return []; }
      })
    ).then((results) =>
      results.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0)).slice(0, 20)
    ),
    Promise.all(
      activeBrands.map(async (brand) => {
        try { return await getVideoSummary(brand, startDate, endDate, 20); } catch { return []; }
      })
    ).then((results) =>
      results.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0)).slice(0, 20)
    ),
    Promise.all(
      activeBrands.map(async (brand) => {
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

  const prevTotals = prevSummaries.reduce(
    (acc, { data }) => {
      if (!data) return acc;
      acc.gmv += data.total_gmv ?? 0;
      acc.orders += data.total_orders ?? 0;
      acc.items += data.total_items_sold ?? 0;
      return acc;
    },
    { gmv: 0, orders: 0, items: 0 }
  );

  const yesterdayGmv = yesterdaySummaries.reduce((sum, { data }) => sum + (data?.total_gmv ?? 0), 0);

  // WoW % changes
  function pctChange(current: number, previous: number): number | undefined {
    if (previous === 0) return current > 0 ? 100 : undefined;
    return ((current - previous) / previous) * 100;
  }

  const gmvTrend = pctChange(totals.gmv, prevTotals.gmv);
  const ordersTrend = pctChange(totals.orders, prevTotals.orders);
  const itemsTrend = pctChange(totals.items, prevTotals.items);
  const avgGmvPerCreator = totals.creators > 0 ? totals.gmv / totals.creators : 0;

  // Brand strip data (always show all brands)
  const alertSummaries = allBrandSummaries ?? summaries;
  const alertPrevSummaries = allBrandPrevSummaries ?? prevSummaries;

  const brandStripData = ALL_BRANDS.map((brand) => {
    const s = alertSummaries.find((x) => x.brand === brand);
    const ps = alertPrevSummaries.find((x) => x.brand === brand);
    const currentGmv = s?.data?.total_gmv ?? 0;
    const prevGmv = ps?.data?.total_gmv ?? 0;
    const trend = pctChange(currentGmv, prevGmv);
    return { brand, gmv: currentGmv, trend };
  });

  // Generate alerts from all brand comparison data
  const alertData = generateAlerts(
    ALL_BRANDS.map((brand) => {
      const s = alertSummaries.find((x) => x.brand === brand);
      const ps = alertPrevSummaries.find((x) => x.brand === brand);
      return {
        brand,
        currentGmv: s?.data?.total_gmv ?? 0,
        prevGmv: ps?.data?.total_gmv ?? 0,
      };
    })
  );

  // Build chart data
  const dateMap = new Map<string, Record<string, number>>();
  for (const { brand, data } of allTrends) {
    for (const row of data) {
      const d = row.report_date;
      if (!dateMap.has(d)) dateMap.set(d, {});
      const entry = dateMap.get(d)!;
      entry[brand] = (entry[brand] ?? 0) + (row.daily_gmv ?? 0);
    }
  }
  const chartBrands = [...activeBrands];
  const chartData = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date: format(new Date(date), 'MMM d'),
      ...Object.fromEntries(chartBrands.map((b) => [b, values[b] ?? 0])),
    }));

  // Daily Brief data
  const topCreator = allCreators.length > 0 ? allCreators[0] : null;
  const topVideo = allVideos.length > 0 ? allVideos[0] : null;
  const brandTrends = brandStripData
    .filter((b): b is typeof b & { trend: number } => b.trend !== undefined)
    .map((b) => ({ brand: b.brand, gmv: b.gmv, trend: b.trend }));

  const trendLabel = 'vs prior period';
  const headerLabel = brandFilter
    ? `${(['jiyu', 'catakor', 'physicians_choice', 'toplux'] as const).includes(brandFilter as typeof ALL_BRANDS[number]) ? ({'jiyu': 'JiYu', 'catakor': 'Cata-Kor', 'physicians_choice': "Physician's Choice", 'toplux': 'TopLux'} as Record<string, string>)[brandFilter] ?? brandFilter : brandFilter} Dashboard`
    : 'Operations Center';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">{headerLabel}</h1>
          <p className="text-sm text-muted-foreground/60 mt-1">
            {brandFilter ? 'Brand performance details' : 'Portfolio performance overview'}
          </p>
        </div>
        <Suspense fallback={null}>
          <DateRangePicker />
        </Suspense>
      </div>

      {/* Brand Filter */}
      <Suspense fallback={null}>
        <BrandFilterBar />
      </Suspense>

      {/* Alert Banners */}
      <AlertBanners alerts={alertData} />

      {/* Daily Brief */}
      <DailyBrief
        totalGmv={totals.gmv}
        gmvTrend={gmvTrend}
        yesterdayGmv={yesterdayGmv}
        totalCreators={totals.creators}
        totalVideos={totals.videos}
        brandTrends={brandTrends}
        topCreator={topCreator ? { creator_name: topCreator.creator_name, total_gmv: topCreator.total_gmv } : null}
        topProduct={allProducts.length > 0 ? { product_name: allProducts[0].product_name, total_gmv: allProducts[0].total_gmv } : null}
        topVideo={topVideo ? { video_title: topVideo.video_title, creator_name: topVideo.creator_name, total_gmv: topVideo.total_gmv } : null}
        startDate={startDate}
        endDate={endDate}
      />

      {/* Portfolio Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 stagger-children">
        <StatCard label="Total GMV" value={formatCurrency(totals.gmv)} trend={gmvTrend} trendLabel={trendLabel} />
        <StatCard label="Orders" value={formatNumber(totals.orders)} trend={ordersTrend} trendLabel={trendLabel} />
        <StatCard label="Items Sold" value={formatNumber(totals.items)} trend={itemsTrend} trendLabel={trendLabel} />
        <StatCard label="Active Creators" value={formatNumber(totals.creators)} />
        <StatCard label="Videos" value={formatNumber(totals.videos)} />
        <StatCard label="Avg GMV/Creator" value={formatCurrency(avgGmvPerCreator)} />
      </div>

      {/* Brand Performance Strip — only show when viewing all brands */}
      {!brandFilter && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Brand Performance</h2>
          <BrandPerformanceStrip brands={brandStripData} />
        </div>
      )}

      {/* GMV Trend Chart */}
      <div className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.2)] p-6">
        <h3 className="text-lg font-bold tracking-tight mb-1">GMV Trend</h3>
        <p className="text-xs text-muted-foreground/50 mb-4">Daily revenue {brandFilter ? '' : 'by brand'}</p>
        <GmvTrendChart data={chartData} brands={chartBrands} />
      </div>

      {/* Tables */}
      <CreatorTable creators={allCreators} />
      <ProductTable products={allProducts} />
      <VideoTable videos={allVideos} />
    </div>
  );
}
