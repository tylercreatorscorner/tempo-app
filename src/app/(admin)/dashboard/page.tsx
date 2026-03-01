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
import { CsvExportButton } from '@/components/dashboard/csv-export-button';
import { AlertBanners } from '@/components/dashboard/alert-banners';
import { ManagedSplit } from '@/components/dashboard/managed-split';
import { CreatorMovers } from '@/components/dashboard/creator-movers';
import { ActionItems } from '@/components/dashboard/action-items';
import { BrandTicker } from '@/components/dashboard/brand-ticker';
import { DailyHeadline } from '@/components/dashboard/daily-headline';
import { VideoMarketReport } from '@/components/dashboard/video-market-report';
import { FeaturedByBrand } from '@/components/dashboard/featured-by-brand';
import type { ActionItem } from '@/components/dashboard/action-items';
import { generateAlerts } from '@/lib/data/alerts';
import { aggregateCreatorsByRealName } from '@/lib/data/creator-aggregate';
import { classifyCreator } from '@/lib/data/creator-status';
import { getRisingVideos, getTrendingVideos } from '@/lib/data/whats-hot';
import { getCreatorRetainers, getTotalRetainer } from '@/lib/data/retainer';
import { unstable_cache } from 'next/cache';
import { BRAND_COLORS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';

// Cache heavy What's Hot queries for 5 minutes
const getCachedRisingVideos = unstable_cache(
  async () => getRisingVideos(5),
  ['rising-videos'],
  { revalidate: 300 }
);
const getCachedTrendingVideos = unstable_cache(
  async () => getTrendingVideos(5),
  ['trending-videos'],
  { revalidate: 300 }
);
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

  // Server render time for "Last Updated"
  const serverNow = new Date();

  // Fetch all brand summaries in parallel (current + previous)
  // Always fetch ALL brands for alerts even when filtering
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
          console.error(`getBrandSummary prev(${brand}) failed:`, err);
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

  // Fetch creators (current + prev), products, videos, trends, AND whats-hot data
  const [allCreators, allPrevCreators, allProducts, allVideos, allTrends, risingVideos, trendingVideos] = await Promise.all([
    Promise.all(
      activeBrands.map(async (brand) => {
        try { return (await getCreatorRankings(brand, startDate, endDate, 20)).map((c) => ({ ...c, brand })); } catch { return []; }
      })
    ).then((results) =>
      results.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0)).slice(0, 20)
    ),
    // Previous period creators for delta calculation
    Promise.all(
      activeBrands.map(async (brand) => {
        try { return (await getCreatorRankings(brand, prevStartDate, prevEndDate, 20)).map((c) => ({ ...c, brand })); } catch { return []; }
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
        try {
          const rows = await getVideoSummary(brand, startDate, endDate, 20);
          return rows.map((r) => ({ ...r, brand }));
        } catch { return []; }
      })
    ).then((results) =>
      results.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0)).slice(0, 20)
    ),
    Promise.all(
      activeBrands.map(async (brand) => {
        try { return { brand, data: await getDailyTrend(brand, startDate, endDate) }; } catch { return { brand, data: [] }; }
      })
    ),
    // What's Hot data (cached 5 min to avoid slow paginated queries on every load)
    getCachedRisingVideos().catch(() => []),
    getCachedTrendingVideos().catch(() => []),
  ]);

  // Enrich videos with first_seen dates
  const videoIds = allVideos.map(v => v.video_id).filter(Boolean) as string[];
  if (videoIds.length > 0) {
    const { createAdminClient } = await import('@/lib/supabase/server');
    const supabase = await createAdminClient();
    const { data: dates } = await supabase
      .from('daily_video_product_stats')
      .select('video_id, report_date')
      .in('video_id', videoIds)
      .order('report_date', { ascending: true });

    const firstSeenMap = new Map<string, string>();
    for (const row of dates ?? []) {
      if (!firstSeenMap.has(row.video_id)) {
        firstSeenMap.set(row.video_id, row.report_date);
      }
    }

    for (const v of allVideos) {
      (v as Record<string, unknown>).first_seen = v.video_id ? firstSeenMap.get(v.video_id) ?? null : null;
    }
  }

  // Group creators by real name
  const groupedCreators = await aggregateCreatorsByRealName(allCreators, brandFilter);
  const groupedPrevCreators = await aggregateCreatorsByRealName(allPrevCreators, brandFilter);

  // Assign statuses to grouped creators
  const creatorsWithStatus = groupedCreators.map((c) => {
    const status = classifyCreator(c.total_videos);
    return { ...c, status };
  });

  // Managed vs Unmanaged split (from displayed creators)
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

  // Total retainer spend from ALL managed creators (not just top 20 displayed)
  const allRetainers = await getCreatorRetainers();
  let totalRetainerSpend = 0;
  for (const [, info] of allRetainers) {
    totalRetainerSpend += getTotalRetainer(info.retainer, info.productRetainers, brandFilter);
  }
  const portfolioRoi = totalRetainerSpend > 0 ? managedSplitData.managed.gmv / totalRetainerSpend : 0;

  // Aggregate portfolio totals
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

  // WoW % changes
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

  const trendLabel = 'vs prior period';

  // Format date range for display
  const displayStart = format(new Date(startDate), 'MMM d');
  const displayEnd = format(new Date(endDate), 'MMM d, yyyy');
  const dateRangeDisplay = `${displayStart} - ${displayEnd}`;
  const filenameDates = `${startDate}-to-${endDate}`;

  // Format last updated
  const lastUpdated = format(serverNow, "MMM d, yyyy 'at' h:mm a") + ' CT';
  const headerLabel = brandFilter
    ? `${(['jiyu', 'catakor', 'physicians_choice', 'toplux'] as const).includes(brandFilter as typeof ALL_BRANDS[number]) ? ({'jiyu': 'JiYu', 'catakor': 'Cata-Kor', 'physicians_choice': "Physician's Choice", 'toplux': 'Toplux'} as Record<string, string>)[brandFilter] ?? brandFilter : brandFilter} Dashboard`
    : 'Operations Center';

  const activeBrandColor = brandFilter ? BRAND_COLORS[brandFilter] ?? null : null;
  const activeBrandName = brandFilter ? BRAND_DISPLAY_NAMES[brandFilter] ?? brandFilter : null;

  // Check if filtered brand has zero data
  const isEmptyBrand = brandFilter && totals.gmv === 0 && totals.orders === 0 && totals.items === 0;

  // === CREATOR MOVEMENT DATA ===

  // Creator movements: compare current vs prev grouped creators
  const prevCreatorMap = new Map(groupedPrevCreators.map((c) => [c.display_name.toLowerCase(), c]));
  let creatorsImproved = 0;
  let creatorsDeclined = 0;
  let creatorsGhost = 0;

  for (const c of groupedCreators) {
    const prev = prevCreatorMap.get(c.display_name.toLowerCase());
    if (c.total_videos === 0) {
      creatorsGhost++;
    } else if (prev) {
      const delta = (c.total_gmv ?? 0) - (prev.total_gmv ?? 0);
      if (delta > 0) creatorsImproved++;
      else if (delta < 0) creatorsDeclined++;
    } else {
      creatorsImproved++; // new creator = improvement
    }
  }

  // Creator Movers: compute deltas
  type CreatorMoverType = {
    display_name: string;
    brand?: string;
    current_gmv: number;
    prev_gmv: number;
    delta_pct: number | null;
    is_ghost: boolean;
    managed_creator_id?: string;
  };

  const creatorMovers: CreatorMoverType[] = groupedCreators.map((c) => {
    const prev = prevCreatorMap.get(c.display_name.toLowerCase());
    const prevGmv = prev?.total_gmv ?? 0;
    const deltaPct = prevGmv > 0 ? ((c.total_gmv - prevGmv) / prevGmv) * 100 : (c.total_gmv > 0 ? 100 : null);
    return {
      display_name: c.display_name,
      brand: c.brand,
      current_gmv: c.total_gmv,
      prev_gmv: prevGmv,
      delta_pct: deltaPct,
      is_ghost: c.total_videos === 0,
      managed_creator_id: c.managed_creator_id,
    };
  });

  const risers = creatorMovers
    .filter((c) => !c.is_ghost && c.delta_pct !== null && c.delta_pct > 0)
    .sort((a, b) => (b.delta_pct ?? 0) - (a.delta_pct ?? 0))
    .slice(0, 5);

  const decliners = [
    ...creatorMovers.filter((c) => c.is_ghost),
    ...creatorMovers.filter((c) => !c.is_ghost && c.delta_pct !== null && c.delta_pct < 0).sort((a, b) => (a.delta_pct ?? 0) - (b.delta_pct ?? 0)),
  ].slice(0, 5);

  // Action Items
  const actionItems: ActionItem[] = [];

  // Ghost creators
  const ghostCount = creatorsWithStatus.filter((c) => c.status === 'ghost').length;
  if (ghostCount > 0) {
    actionItems.push({
      icon: '👻',
      text: `<strong>${ghostCount} creator${ghostCount > 1 ? 's' : ''}</strong> are ghosts this period (0 posts)`,
      link: '/creators?status=ghost',
      priority: 'high',
    });
  }

  // Brand GMV drops > 20%
  for (const bd of brandStripData) {
    if (bd.trend !== undefined && bd.trend <= -20) {
      const brandName = BRAND_DISPLAY_NAMES[bd.brand] ?? bd.brand;
      actionItems.push({
        icon: '⚠️',
        text: `<strong>${brandName}</strong> GMV dropped ${Math.abs(bd.trend).toFixed(0)}% — investigate`,
        link: `?range=${params.range ?? 'last7'}&brand=${bd.brand}`,
        priority: 'high',
      });
    }
  }

  // Hot videos count
  const hotVideosCount = allVideos.filter(v => v.total_gmv >= 100).length;
  if (hotVideosCount > 0) {
    actionItems.push({
      icon: '🔥',
      text: `<strong>${hotVideosCount} video${hotVideosCount > 1 ? 's' : ''}</strong> performing strongly (≥$100 GMV)`,
      link: '/whats-hot',
      priority: 'low',
    });
  }

  // At-risk / behind creators
  const atRiskCount = creatorsWithStatus.filter((c) => c.status === 'at_risk' || c.status === 'behind').length;
  if (atRiskCount > 0) {
    actionItems.push({
      icon: '📋',
      text: `<strong>${atRiskCount} creator${atRiskCount > 1 ? 's' : ''}</strong> below posting target — retainer check needed`,
      link: '/creators?status=at_risk',
      priority: 'medium',
    });
  }

  // Declining creators
  if (creatorsDeclined > 0) {
    actionItems.push({
      icon: '📉',
      text: `<strong>${creatorsDeclined} creator${creatorsDeclined > 1 ? 's' : ''}</strong> saw GMV decline vs prior period`,
      priority: 'medium',
    });
  }

  // Additional data for new components
  const topVideo = allVideos[0];
  const topCreator = groupedCreators[0];
  const topVideoGmv = topVideo?.total_gmv ?? 0;
  const topCreatorGmv = topCreator?.total_gmv ?? 0;
  const topCreatorName = topCreator?.display_name;
  
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

      {/* ========== SECTION 1: THE HEADLINES ========== */}
      
      {/* Brand Ticker Bar */}
      <BrandTicker brands={brandStripData} />

      {/* Daily Headline with Portfolio Weather */}
      <DailyHeadline
        brands={brandStripData}
        topVideoGmv={topVideoGmv}
        topCreatorName={topCreatorName}
        topCreatorGmv={topCreatorGmv}
        portfolioChange={gmvTrend}
        totalGmv={totals.gmv}
        period="Period"
      />

      {/* Alert Banners (FIXED - was imported but not rendered) */}
      <AlertBanners alerts={alertData} />

      {/* Action Items (MOVED UP) */}
      <ActionItems items={actionItems} />

      {/* ========== SECTION 2: THE NUMBERS ========== */}

      {/* Portfolio Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 stagger-children">
        <StatCard label="Total GMV" value={formatCurrency(totals.gmv)} trend={gmvTrend} trendLabel={trendLabel} brandColor={activeBrandColor} />
        <StatCard label="Orders" value={formatNumber(totals.orders)} trend={ordersTrend} trendLabel={trendLabel} brandColor={activeBrandColor} />
        <StatCard label="Items Sold" value={formatNumber(totals.items)} trend={itemsTrend} trendLabel={trendLabel} brandColor={activeBrandColor} />
        <StatCard label="Active Creators" value={formatNumber(totals.creators)} brandColor={activeBrandColor} />
        <StatCard label="Videos" value={formatNumber(totals.videos)} brandColor={activeBrandColor} />
        <StatCard label="Avg GMV/Creator" value={formatCurrency(avgGmvPerCreator)} trend={avgGmvTrend} trendLabel={trendLabel} brandColor={activeBrandColor} />
      </div>

      {/* ROI Summary */}
      {totalRetainerSpend > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard label="Retainer Spend" value={formatCurrency(totalRetainerSpend)} brandColor={activeBrandColor} />
          <StatCard label="Managed GMV" value={formatCurrency(managedSplitData.managed.gmv)} brandColor={activeBrandColor} />
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 flex flex-col justify-center">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">Portfolio ROI</p>
            <p className={`text-2xl font-extrabold tabular-nums ${portfolioRoi >= 1 ? 'text-green-600' : 'text-red-500'}`}>
              {portfolioRoi.toFixed(1)}x
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Managed GMV ÷ Retainer Spend</p>
          </div>
        </div>
      )}

      {/* Brand Performance Strip — only show when viewing all brands */}
      {!brandFilter && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Brand Performance</h2>
          <BrandPerformanceStrip brands={brandStripData} />
        </div>
      )}

      {/* ========== SECTION 3: WHAT'S HOT ========== */}

      {/* Video Market Report */}
      <VideoMarketReport videos={allVideos} />

      {/* Featured Videos by Brand */}
      <FeaturedByBrand videos={allVideos} />

      {/* Creator Movers */}
      <CreatorMovers risers={risers} decliners={decliners} />

      {/* ========== SECTION 4: THE DATA ========== */}

      {/* Empty state for brands with no data */}
      {isEmptyBrand && (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-gray-500 text-base">
            No performance data available for {activeBrandName} yet. Data will appear once creators start generating sales.
          </p>
        </div>
      )}

      {/* GMV Trend Chart */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
        <h3 className="text-lg font-bold tracking-tight text-[#1A1B3A] mb-1">GMV Trend</h3>
        <p className="text-xs text-gray-400 mb-4">Daily revenue {brandFilter ? '' : 'by brand'}</p>
        <GmvTrendChart data={chartData} brands={chartBrands} />
      </div>

      {/* Managed vs Unmanaged Split */}
      <ManagedSplit data={managedSplitData} />

      {/* Tables */}
      <CreatorTable
        creators={creatorsWithStatus}
        csvButton={
          <CsvExportButton
            filename={`tempo-top-creators-${filenameDates}.csv`}
            headers={['Rank', 'Creator', 'Brand', 'Handles', 'GMV', 'Orders', 'Items Sold', 'Videos', 'Managed', 'Retainer', 'ROI']}
            rows={creatorsWithStatus.map((c, i) => [i + 1, c.display_name, c.brand ?? '', c.handles.join('; '), c.total_gmv, c.total_orders, c.total_items_sold, c.total_videos, c.isManaged ? 'Yes' : 'No', c.retainer > 0 ? c.retainer : '', c.retainer > 0 ? `${(c.total_gmv / c.retainer).toFixed(1)}x` : ''])}
          />
        }
      />
      <ProductTable
        products={allProducts}
        csvButton={
          <CsvExportButton
            filename={`tempo-top-products-${filenameDates}.csv`}
            headers={['Rank', 'Product', 'GMV', 'Orders', 'Items Sold']}
            rows={allProducts.map((p, i) => [i + 1, p.product_name, p.total_gmv, p.total_orders, p.total_items_sold])}
          />
        }
      />
      <VideoTable
        videos={allVideos}
        csvButton={
          <CsvExportButton
            filename={`tempo-top-videos-${filenameDates}.csv`}
            headers={['Rank', 'Video', 'Creator', 'Brand', 'GMV', 'Posted', 'Orders']}
            rows={allVideos.map((v, i) => [i + 1, v.video_title || 'Untitled', v.creator_name, String((v as Record<string, unknown>).brand ?? ''), v.total_gmv, String((v as Record<string, unknown>).first_seen ?? ''), v.total_orders])}
          />
        }
      />
    </div>
  );
}
