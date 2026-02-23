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
import { BrandFilterBar } from '@/components/dashboard/brand-filter-bar';
import { AlertBanners } from '@/components/dashboard/alert-banners';
import { TodaysPulse } from '@/components/dashboard/todays-pulse';
import { ViralNow } from '@/components/dashboard/viral-now';
import { CreatorMovers } from '@/components/dashboard/creator-movers';
import { ActionItems } from '@/components/dashboard/action-items';
import type { ActionItem } from '@/components/dashboard/action-items';
import type { ViralVideo as ViralNowVideo } from '@/components/dashboard/viral-now';
import { generateAlerts } from '@/lib/data/alerts';
import { aggregateCreatorsByRealName } from '@/lib/data/creator-aggregate';
import { classifyCreator } from '@/lib/data/creator-status';
import { getRisingVideos, getTrendingVideos } from '@/lib/data/whats-hot';
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
    // What's Hot data
    getRisingVideos(5).catch(() => []),
    getTrendingVideos(5).catch(() => []),
  ]);

  // Group creators by real name
  const groupedCreators = await aggregateCreatorsByRealName(allCreators);
  const groupedPrevCreators = await aggregateCreatorsByRealName(allPrevCreators);

  // Assign statuses to grouped creators
  const creatorsWithStatus = groupedCreators.map((c) => {
    const status = classifyCreator(c.total_videos);
    return { ...c, status };
  });

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

  // === NEW SECTION DATA ===

  // Today's Pulse: viral videos (top trending by GMV)
  const pulseViralVideos = trendingVideos.slice(0, 3).map((v) => ({
    video_title: v.video_title,
    creator_name: v.creator_name,
    brand: v.brand,
    total_gmv: v.total_gmv,
    video_link: v.video_link,
  }));

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

  // GMV delta
  const gmvDelta = totals.gmv - prevTotals.gmv;
  const gmvDeltaPct = pctChange(totals.gmv, prevTotals.gmv);

  // Viral Now: merge rising + trending, deduplicate, sort by growth then GMV
  const viralVideoMap = new Map<string, ViralNowVideo>();
  for (const v of risingVideos) {
    viralVideoMap.set(v.video_id, {
      video_id: v.video_id,
      video_title: v.video_title,
      creator_name: v.creator_name,
      brand: v.brand,
      gmv: v.recent_avg_gmv * 3, // total recent GMV
      growth_pct: v.growth_pct,
      video_link: v.video_link,
    });
  }
  for (const v of trendingVideos) {
    if (!viralVideoMap.has(v.video_id)) {
      viralVideoMap.set(v.video_id, {
        video_id: v.video_id,
        video_title: v.video_title,
        creator_name: v.creator_name,
        brand: v.brand,
        gmv: v.total_gmv,
        growth_pct: null,
        video_link: v.video_link,
      });
    }
  }
  const viralNowVideos = Array.from(viralVideoMap.values())
    .sort((a, b) => (b.growth_pct ?? 0) - (a.growth_pct ?? 0) || b.gmv - a.gmv)
    .slice(0, 5);

  // Creator Movers: compute deltas
  type CreatorMoverType = {
    display_name: string;
    brand?: string;
    current_gmv: number;
    prev_gmv: number;
    delta_pct: number | null;
    is_ghost: boolean;
    managed_creator_id?: number;
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

  // Viral videos count
  const viralCount = risingVideos.length + trendingVideos.length;
  if (viralCount > 0) {
    actionItems.push({
      icon: '🔥',
      text: `<strong>${viralCount} video${viralCount > 1 ? 's' : ''}</strong> went viral recently`,
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

      {/* Brand Filter */}
      <Suspense fallback={null}>
        <BrandFilterBar />
      </Suspense>

      {/* Portfolio Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 stagger-children">
        <StatCard label="Total GMV" value={formatCurrency(totals.gmv)} trend={gmvTrend} trendLabel={trendLabel} brandColor={activeBrandColor} />
        <StatCard label="Orders" value={formatNumber(totals.orders)} trend={ordersTrend} trendLabel={trendLabel} brandColor={activeBrandColor} />
        <StatCard label="Items Sold" value={formatNumber(totals.items)} trend={itemsTrend} trendLabel={trendLabel} brandColor={activeBrandColor} />
        <StatCard label="Active Creators" value={formatNumber(totals.creators)} brandColor={activeBrandColor} />
        <StatCard label="Videos" value={formatNumber(totals.videos)} brandColor={activeBrandColor} />
        <StatCard label="Avg GMV/Creator" value={formatCurrency(avgGmvPerCreator)} trend={avgGmvTrend} trendLabel={trendLabel} brandColor={activeBrandColor} />
      </div>

      {/* Today's Pulse — NEW */}
      <TodaysPulse
        viralVideos={pulseViralVideos}
        creatorsImproved={creatorsImproved}
        creatorsDeclined={creatorsDeclined}
        creatorsGhost={creatorsGhost}
        gmvDelta={gmvDelta}
        gmvDeltaPct={gmvDeltaPct}
      />

      {/* Viral Right Now — NEW */}
      <ViralNow videos={viralNowVideos} />

      {/* Empty state for brands with no data */}
      {isEmptyBrand && (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-gray-500 text-base">
            No performance data available for {activeBrandName} yet. Data will appear once creators start generating sales.
          </p>
        </div>
      )}

      {/* Brand Performance Strip — only show when viewing all brands */}
      {!brandFilter && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Brand Performance</h2>
          <BrandPerformanceStrip brands={brandStripData} />
        </div>
      )}

      {/* GMV Trend Chart */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
        <h3 className="text-lg font-bold tracking-tight text-[#1A1B3A] mb-1">GMV Trend</h3>
        <p className="text-xs text-gray-400 mb-4">Daily revenue {brandFilter ? '' : 'by brand'}</p>
        <GmvTrendChart data={chartData} brands={chartBrands} />
      </div>

      {/* Creator Movers — NEW */}
      <CreatorMovers risers={risers} decliners={decliners} />

      {/* Action Items — NEW */}
      <ActionItems items={actionItems} />

      {/* Tables */}
      <CreatorTable
        creators={creatorsWithStatus}
        csvButton={
          <CsvExportButton
            filename={`tempo-top-creators-${filenameDates}.csv`}
            headers={['Rank', 'Creator', 'Handles', 'GMV', 'Orders', 'Items Sold', 'Videos']}
            rows={creatorsWithStatus.map((c, i) => [i + 1, c.display_name, c.handles.join('; '), c.total_gmv, c.total_orders, c.total_items_sold, c.total_videos])}
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
            headers={['Rank', 'Video', 'Creator', 'Brand', 'GMV', 'Sales Days', 'Orders']}
            rows={allVideos.map((v, i) => [i + 1, v.video_title || 'Untitled', v.creator_name, String((v as Record<string, unknown>).brand ?? ''), v.total_gmv, v.days_active ?? 0, v.total_orders])}
          />
        }
      />
    </div>
  );
}
