import { Suspense } from 'react';
import { getBrandSummary, getCreatorRankings } from '@/lib/data/rpc';
import { resolveDateRange } from '@/lib/data/date-utils';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { StatCard } from '@/components/dashboard/stat-card';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { AlertBanners } from '@/components/dashboard/alert-banners';
import { BrandTicker } from '@/components/dashboard/brand-ticker';
import { DailyHeadline } from '@/components/dashboard/daily-headline';
import { VideoSection } from '@/components/dashboard/video-section';
import { generateAlerts } from '@/lib/data/alerts';
import { aggregateCreatorsByRealName } from '@/lib/data/creator-aggregate';
import { getDashboardVideos } from '@/lib/data/video-sections';
import { BRAND_COLORS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';

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

  const activeBrands = brandFilter ? [brandFilter] as const : ALL_BRANDS;

  // Previous period for comparison
  const start = new Date(startDate);
  const end = new Date(endDate);
  const periodLength = differenceInDays(end, start) + 1;
  const prevEnd = subDays(start, 1);
  const prevStart = subDays(prevEnd, periodLength - 1);
  const prevStartDate = format(prevStart, 'yyyy-MM-dd');
  const prevEndDate = format(prevEnd, 'yyyy-MM-dd');

  const serverNow = new Date();

  // Fetch summaries (current + previous) + all brands for alerts
  const [summaries, prevSummaries, allBrandSummaries, allBrandPrevSummaries] = await Promise.all([
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
          return { brand, data: null };
        }
      })
    ),
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
      : Promise.resolve(null),
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

  // Fetch creators + video sections in parallel
  const [allCreators, videoSections] = await Promise.all([
    Promise.all(
      activeBrands.map(async (brand) => {
        try { return (await getCreatorRankings(brand, startDate, endDate, 50)).map((c) => ({ ...c, brand })); } catch { return []; }
      })
    ).then((results) =>
      results.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0))
    ),
    getDashboardVideos(brandFilter, startDate, endDate),
  ]);

  // Group creators for managed/unmanaged split
  const groupedCreators = await aggregateCreatorsByRealName(allCreators, brandFilter);

  // Managed vs Unmanaged split
  const managedSplitData = {
    managed: { gmv: 0, orders: 0, creators: 0, videos: 0 },
    unmanaged: { gmv: 0, orders: 0, creators: 0, videos: 0 },
  };
  for (const c of groupedCreators) {
    const bucket = c.isManaged ? managedSplitData.managed : managedSplitData.unmanaged;
    bucket.gmv += c.total_gmv;
    bucket.orders += c.total_orders;
    bucket.creators += 1;
    bucket.videos += c.total_videos;
  }

  // Portfolio totals
  const totals = summaries.reduce(
    (acc, { data }) => {
      if (!data) return acc;
      acc.gmv += data.total_gmv ?? 0;
      acc.orders += data.total_orders ?? 0;
      acc.items += data.total_items_sold ?? 0;
      acc.creators += data.unique_creators ?? 0;
      acc.videos += data.total_videos ?? 0;
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
      acc.creators += data.unique_creators ?? 0;
      return acc;
    },
    { gmv: 0, orders: 0, items: 0, creators: 0 }
  );

  function pctChange(current: number, previous: number): number | undefined {
    if (previous === 0) return current > 0 ? 100 : undefined;
    return ((current - previous) / previous) * 100;
  }

  const gmvTrend = pctChange(totals.gmv, prevTotals.gmv);
  const ordersTrend = pctChange(totals.orders, prevTotals.orders);
  const itemsTrend = pctChange(totals.items, prevTotals.items);
  const avgGmvPerCreator = totals.creators > 0 ? totals.gmv / totals.creators : 0;
  const prevAvgGmvPerCreator = prevTotals.creators > 0 ? prevTotals.gmv / prevTotals.creators : 0;
  const avgGmvTrend = pctChange(avgGmvPerCreator, prevAvgGmvPerCreator);

  // Brand strip data
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

  // Alerts
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

  const trendLabel = 'vs prior period';
  const displayStart = format(new Date(startDate), 'MMM d');
  const displayEnd = format(new Date(endDate), 'MMM d, yyyy');
  const dateRangeDisplay = `${displayStart} - ${displayEnd}`;
  const lastUpdated = format(serverNow, "MMM d, yyyy 'at' h:mm a") + ' CT';

  const headerLabel = brandFilter
    ? `${BRAND_DISPLAY_NAMES[brandFilter] ?? brandFilter} Dashboard`
    : 'Operations Center';

  const activeBrandColor = brandFilter ? BRAND_COLORS[brandFilter] ?? null : null;
  const activeBrandName = brandFilter ? BRAND_DISPLAY_NAMES[brandFilter] ?? brandFilter : null;

  // Headline data
  const topCreator = groupedCreators[0];
  const topCreatorGmv = topCreator?.total_gmv ?? 0;
  const topCreatorName = topCreator?.display_name;
  // Find top video GMV from all sections
  const allSectionVideos = [...videoSections.hotNow, ...videoSections.rising, ...videoSections.topPerformers];
  const topVideoGmv = allSectionVideos.length > 0 ? Math.max(...allSectionVideos.map((v) => v.total_gmv)) : 0;

  const isEmptyBrand = brandFilter && totals.gmv === 0 && totals.orders === 0 && totals.items === 0;

  // Managed GMV trend (compare to previous period is complex, just show values)
  const managedGmvPct = totals.gmv > 0 ? (managedSplitData.managed.gmv / totals.gmv) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1A1B3A]">{headerLabel}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {brandFilter ? 'Brand performance details' : 'Portfolio performance overview'}
          </p>
          <p className="text-xs text-gray-400 mt-1">Last updated: {lastUpdated}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Suspense fallback={null}>
            <DateRangePicker />
          </Suspense>
          <span className="text-xs text-gray-400 font-medium">{dateRangeDisplay}</span>
        </div>
      </div>

      {/* Stats Bar with Managed/Unmanaged integrated */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 stagger-children">
        <StatCard label="Total GMV" value={formatCurrency(totals.gmv)} trend={gmvTrend} trendLabel={trendLabel} brandColor={activeBrandColor} />
        <StatCard label="Orders" value={formatNumber(totals.orders)} trend={ordersTrend} trendLabel={trendLabel} brandColor={activeBrandColor} />
        <StatCard label="Items Sold" value={formatNumber(totals.items)} trend={itemsTrend} trendLabel={trendLabel} brandColor={activeBrandColor} />
        <StatCard label="Active Creators" value={formatNumber(totals.creators)} brandColor={activeBrandColor} />
        <StatCard label="Videos" value={formatNumber(totals.videos)} brandColor={activeBrandColor} />
        <StatCard label="Avg GMV/Creator" value={formatCurrency(avgGmvPerCreator)} trend={avgGmvTrend} trendLabel={trendLabel} brandColor={activeBrandColor} />
        {/* Managed/Unmanaged integrated into stats bar */}
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 space-y-2 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Managed GMV</p>
          <p className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#1A1B3A]">{formatCurrency(managedSplitData.managed.gmv)}</p>
          <div className="flex items-center gap-1.5">
            <span className="bg-green-50 text-green-600 text-xs font-semibold px-1.5 py-0.5 rounded-md">
              {managedGmvPct.toFixed(0)}% of total
            </span>
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 space-y-2 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Unmanaged GMV</p>
          <p className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#1A1B3A]">{formatCurrency(managedSplitData.unmanaged.gmv)}</p>
          <div className="flex items-center gap-1.5">
            <span className="bg-gray-50 text-gray-500 text-xs font-semibold px-1.5 py-0.5 rounded-md">
              {(100 - managedGmvPct).toFixed(0)}% of total
            </span>
          </div>
        </div>
      </div>

      {/* Brand Ticker */}
      <BrandTicker brands={brandStripData} />

      {/* Daily Headline */}
      <DailyHeadline
        brands={brandStripData}
        topVideoGmv={topVideoGmv}
        topCreatorName={topCreatorName}
        topCreatorGmv={topCreatorGmv}
        portfolioChange={gmvTrend}
        totalGmv={totals.gmv}
        period="Period"
      />

      {/* Alert Banners */}
      <AlertBanners alerts={alertData} />

      {/* Empty state */}
      {isEmptyBrand && (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-gray-500 text-base">
            No performance data available for {activeBrandName} yet. Data will appear once creators start generating sales.
          </p>
        </div>
      )}

      {/* Video Sections */}
      <VideoSection
        emoji="🔥"
        title="Hot Now"
        videos={videoSections.hotNow}
      />

      <VideoSection
        emoji="📈"
        title="Rising"
        videos={videoSections.rising}
      />

      <VideoSection
        emoji="🏆"
        title="Top Performers"
        videos={videoSections.topPerformers}
      />
    </div>
  );
}
