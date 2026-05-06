export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import {
  getBrandSummary, getCreatorRankings, getProductSummary, getVideoSummary, getDailyTrend,
} from '@/lib/data/rpc';
import { resolveDateRange } from '@/lib/data/date-utils';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { BrandFilter } from '@/components/creators/brand-filter';
import { PerformanceChart, type DailyMetrics } from '@/components/analytics/performance-chart';
import { NotableChanges, type BrandChange, type CreatorBreakout, type HotPost } from '@/components/analytics/notable-changes';
import { StatCard } from '@/components/dashboard/stat-card';
import { BRAND_DISPLAY_NAMES, BRAND_COLORS, HIDDEN_FROM_PICKER, expandBrandToDataSlugs } from '@/lib/utils/constants';
import { pctChange } from '@/lib/utils/trend';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { AlertTriangle } from 'lucide-react';

interface Props {
  searchParams: Promise<{ range?: string; brand?: string; start?: string; end?: string }>;
}

/** Compute the prior period — same length, immediately preceding the current range. */
function priorPeriod(startDate: string, endDate: string): { prevStart: string; prevEnd: string } {
  const start = new Date(startDate);
  const end   = new Date(endDate);
  const days  = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevEnd   = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { prevStart: fmt(prevStart), prevEnd: fmt(prevEnd) };
}

export default async function AnalyticsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { startDate, endDate } = resolveDateRange(params.range, params.start, params.end);
  const { prevStart, prevEnd } = priorPeriod(startDate, endDate);

  const supabase = await createClient();
  const { getAllowedBrandsForUser } = await import('@/lib/data/brands');
  const allowedBrands = await getAllowedBrandsForUser();
  let brandsQuery = supabase.from('brands_v2').select('slug').eq('is_archived', false);
  if (allowedBrands) brandsQuery = brandsQuery.in('slug', allowedBrands);
  const { data: dbBrands } = await brandsQuery.order('name');
  const ALL_BRANDS = (dbBrands ?? []).map(b => b.slug).filter(s => !HIDDEN_FROM_PICKER.has(s));

  // Cross-reference: which (handle|brand) pairs are managed?
  // Umbrella roster brands ('leefar') get expanded so the lookup matches
  // creator_performance rows keyed by store ('leefar_nutrition', etc.).
  const admin = await createAdminClient();
  const { data: managedRows } = await admin
    .from('managed_creators')
    .select('id, brand, account_1, account_2, account_3, account_4, account_5')
    .is('archived_at', null);
  const managedSet = new Map<string, string>(); // "handle|||brand" → managed_creators.id
  const norm = (h: string) => h.replace(/^@/, '').trim().toLowerCase();
  for (const m of managedRows ?? []) {
    if (!m.brand) continue;
    const dataBrands = expandBrandToDataSlugs(m.brand);
    for (const acct of [m.account_1, m.account_2, m.account_3, m.account_4, m.account_5]) {
      if (!acct) continue;
      const handle = norm(acct);
      for (const db of dataBrands) {
        managedSet.set(`${handle}|||${db}`, m.id);
      }
    }
  }

  const brandFilter = params.brand && ALL_BRANDS.includes(params.brand) ? params.brand : null;
  // Expand the brand filter to data slugs (e.g. 'leefar' → both stores) so
  // the underlying RPCs hit the right rows in creator_performance/videos/etc.
  const BRANDS = brandFilter
    ? Array.from(expandBrandToDataSlugs(brandFilter))
    : ALL_BRANDS.flatMap(b => Array.from(expandBrandToDataSlugs(b)));

  // Parallel fetch: per-brand summaries (current + prior period), trend series (current + prior), and entity tables
  const [
    summariesByBrand,
    prevSummariesByBrand,
    trendsByBrand,
    prevTrendsByBrand,
    allCreators,
    prevAllCreators,
    allProducts,
    allVideos,
  ] = await Promise.all([
    Promise.all(BRANDS.map(async (brand) => {
      try { return { brand, summary: (await getBrandSummary(brand, startDate, endDate))[0] }; }
      catch { return { brand, summary: null }; }
    })),
    Promise.all(BRANDS.map(async (brand) => {
      try { return { brand, summary: (await getBrandSummary(brand, prevStart, prevEnd))[0] }; }
      catch { return { brand, summary: null }; }
    })),
    Promise.all(BRANDS.map(async (brand) => {
      try { return { brand, trend: await getDailyTrend(brand, startDate, endDate) }; }
      catch { return { brand, trend: [] }; }
    })),
    Promise.all(BRANDS.map(async (brand) => {
      try { return { brand, trend: await getDailyTrend(brand, prevStart, prevEnd) }; }
      catch { return { brand, trend: [] }; }
    })),
    Promise.all(BRANDS.map(async (brand) => {
      try {
        const data = await getCreatorRankings(brand, startDate, endDate, 500);
        return data.map((c) => ({ ...c, brand }));
      } catch { return []; }
    })).then((r) => r.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0))),
    // Prior period creator rankings — used for breakout detection
    Promise.all(BRANDS.map(async (brand) => {
      try {
        const data = await getCreatorRankings(brand, prevStart, prevEnd, 500);
        return data.map((c) => ({ ...c, brand }));
      } catch { return []; }
    })).then((r) => r.flat()),
    Promise.all(BRANDS.map(async (brand) => {
      try {
        const data = await getProductSummary(brand, startDate, endDate, 100);
        return data.map((p) => ({ ...p, brand }));
      } catch { return []; }
    })).then((r) => r.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0))),
    Promise.all(BRANDS.map(async (brand) => {
      try {
        const data = await getVideoSummary(brand, startDate, endDate, 200);
        return data.map((v) => ({ ...v, brand }));
      } catch { return []; }
    })).then((r) => r.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0))),
  ]);

  // Aggregate totals across all queried brands
  const totals = summariesByBrand.reduce((acc, { summary }) => {
    if (!summary) return acc;
    acc.gmv      += summary.total_gmv;
    acc.orders   += summary.total_orders;
    acc.items    += summary.total_items_sold;
    acc.videos   += summary.total_videos;
    acc.creators += summary.unique_creators;
    return acc;
  }, { gmv: 0, orders: 0, items: 0, videos: 0, creators: 0 });

  const prevTotals = prevSummariesByBrand.reduce((acc, { summary }) => {
    if (!summary) return acc;
    acc.gmv      += summary.total_gmv;
    acc.orders   += summary.total_orders;
    acc.items    += summary.total_items_sold;
    acc.videos   += summary.total_videos;
    acc.creators += summary.unique_creators;
    return acc;
  }, { gmv: 0, orders: 0, items: 0, videos: 0, creators: 0 });

  const avgGmvPerVideo = totals.videos > 0 ? totals.gmv / totals.videos : 0;
  const prevAvgGmvPerVideo = prevTotals.videos > 0 ? prevTotals.gmv / prevTotals.videos : 0;

  // Aggregate daily trend across brands — keep all 4 metrics for the multi-metric chart
  const aggregateTrend = (byBrand: Array<{ trend: Awaited<ReturnType<typeof getDailyTrend>> }>): DailyMetrics[] => {
    const byDate = new Map<string, { gmv: number; orders: number; items: number; videos: number }>();
    for (const { trend } of byBrand) {
      for (const row of trend) {
        const existing = byDate.get(row.report_date) ?? { gmv: 0, orders: 0, items: 0, videos: 0 };
        existing.gmv    += row.daily_gmv;
        existing.orders += row.daily_orders;
        existing.items  += row.daily_items_sold;
        existing.videos += row.daily_videos;
        byDate.set(row.report_date, existing);
      }
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, m]) => ({ date, ...m }));
  };
  const aggregatedTrend     = aggregateTrend(trendsByBrand);
  const aggregatedPrevTrend = aggregateTrend(prevTrendsByBrand);

  // Stale-data check — latest data point in the trend series
  const latestDate = aggregatedTrend.length > 0
    ? aggregatedTrend[aggregatedTrend.length - 1].date
    : null;
  const daysStale = latestDate
    ? Math.floor((Date.now() - new Date(latestDate).getTime()) / 86400000)
    : null;
  const isStale = daysStale != null && daysStale > 3;

  // Brand breakdown for the "All Brands" view — sorted by GMV desc
  const brandBreakdown = summariesByBrand
    .map(({ brand, summary }) => ({
      brand,
      gmv: summary?.total_gmv ?? 0,
      orders: summary?.total_orders ?? 0,
      videos: summary?.total_videos ?? 0,
    }))
    .filter(b => b.gmv > 0)
    .sort((a, b) => b.gmv - a.gmv);

  const maxBrandGmv = brandBreakdown[0]?.gmv ?? 1;

  // Maps for table rows — these feed AnalyticsTabs and the new top-N cards.
  // is_managed is set by cross-referencing the (handle|brand) tuple against managed_creators.
  const creators = allCreators.map((c) => {
    const key = `${norm(c.creator_name)}|||${c.brand}`;
    const managedId = managedSet.get(key) ?? null;
    return {
      creator_name: c.creator_name,
      total_videos: c.total_videos,
      total_gmv: c.total_gmv,
      total_orders: c.total_orders,
      total_items_sold: c.total_items_sold,
      avg_gmv_per_video: c.total_videos > 0 ? c.total_gmv / c.total_videos : 0,
      brand: c.brand,
      is_managed: managedId !== null,
      managed_id: managedId,
    };
  });
  const products = allProducts.map((p) => ({
    product_name: p.product_name,
    total_items_sold: p.total_items_sold,
    total_gmv: p.total_gmv,
    total_orders: p.total_orders,
    brand: p.brand,
  }));
  const videos = allVideos.map((v) => ({
    video_id: v.video_id,
    video_title: v.video_title || 'Untitled',
    creator_name: v.creator_name,
    total_gmv: v.total_gmv,
    total_orders: v.total_orders,
    total_items_sold: v.total_items_sold,
    total_views: v.total_views,
    days_active: v.days_active,
    brand: v.brand,
  }));

  // ─── Notable Changes computation ──────────────────────────────────────────
  // Top brand riser/faller — compare current vs prior period
  const brandDeltas: BrandChange[] = summariesByBrand
    .map(({ brand, summary }) => {
      const prior = prevSummariesByBrand.find(p => p.brand === brand)?.summary;
      const cur = summary?.total_gmv ?? 0;
      const pri = prior?.total_gmv ?? 0;
      const delta_pct = pri === 0 ? (cur > 0 ? 100 : 0) : ((cur - pri) / pri) * 100;
      return { brand, current: cur, prior: pri, delta_pct };
    })
    // Need meaningful base to consider — at least $500 in either period
    .filter(b => b.current > 500 || b.prior > 500);

  const brandRiser  = brandDeltas.filter(b => b.delta_pct > 0).sort((a, b) => b.delta_pct - a.delta_pct)[0] ?? null;
  const brandFaller = brandDeltas.filter(b => b.delta_pct < 0).sort((a, b) => a.delta_pct - b.delta_pct)[0] ?? null;

  // Don't surface a riser if it's the only brand (uninteresting)
  const meaningfulRiser  = brandDeltas.length > 1 && brandRiser  ? brandRiser  : null;
  const meaningfulFaller = brandDeltas.length > 1 && brandFaller ? brandFaller : null;

  // Breakout creator — biggest current-period creator that wasn't already top last period
  const prevCreatorMap = new Map<string, number>();
  for (const c of prevAllCreators) {
    const key = `${norm(c.creator_name)}|||${c.brand}`;
    prevCreatorMap.set(key, c.total_gmv);
  }
  let creatorBreakout: CreatorBreakout | null = null;
  let bestBreakoutScore = 0;
  for (const c of creators) {
    if (c.total_gmv < 1000) continue; // ignore noise
    const key = `${norm(c.creator_name)}|||${c.brand}`;
    const prior = prevCreatorMap.get(key) ?? 0;
    const delta_pct = prior === 0 ? (c.total_gmv > 1000 ? 999 : 0) : ((c.total_gmv - prior) / prior) * 100;
    // Score = delta% × log(GMV) — favors big jumps on big-enough creators
    const score = delta_pct * Math.log(c.total_gmv);
    if (delta_pct > 50 && score > bestBreakoutScore) {
      bestBreakoutScore = score;
      creatorBreakout = {
        creator_name: c.creator_name,
        brand: c.brand,
        current_gmv: c.total_gmv,
        prior_gmv: prior,
        delta_pct,
        is_managed: c.is_managed,
      };
    }
  }

  // Hottest post — highest GMV-per-day among posts that are <= 7 days active
  // (rapidly ramping, hasn't fully cooled yet)
  let hotPost: HotPost | null = null;
  let bestVelocity = 0;
  for (const v of allVideos) {
    if (v.days_active === 0 || v.days_active > 7) continue;
    if (v.total_gmv < 500) continue;
    const velocity = v.total_gmv / v.days_active;
    if (velocity > bestVelocity) {
      bestVelocity = velocity;
      hotPost = {
        video_id: v.video_id,
        video_title: v.video_title || 'Untitled',
        creator_name: v.creator_name,
        brand: v.brand,
        total_gmv: v.total_gmv,
        days_active: v.days_active,
        velocity,
      };
    }
  }

  return (
    <div className="space-y-6">
      {/* Stale-data banner */}
      {isStale && latestDate && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">
              Performance data is {daysStale} days old
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Last data point: {new Date(latestDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
              Numbers below may be lower than reality until a fresh upload is processed.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1A1B3A]">
            {brandFilter ? `${BRAND_DISPLAY_NAMES[brandFilter] ?? brandFilter} Analytics` : 'Analytics'}
          </h1>
          <div className="flex items-center gap-3 mt-0.5">
            <p className="text-sm text-gray-400">Performance insights across creators, products, and videos</p>
            {latestDate && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-gray-400">
                <span className={`h-1.5 w-1.5 rounded-full ${isStale ? 'bg-amber-400' : 'bg-green-400'}`} />
                {daysStale === 0 ? 'Updated today' : daysStale === 1 ? 'Updated yesterday' : `Updated ${daysStale}d ago`}
              </span>
            )}
          </div>
        </div>
        <Suspense fallback={null}>
          <DateRangePicker />
        </Suspense>
      </div>

      {/* Brand filter pills — sticky on scroll so you can switch brands at any time */}
      {ALL_BRANDS.length > 1 && (
        <div className="sticky top-0 z-30 -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6 py-2 bg-[#F8F9FC]/85 backdrop-blur-md border-b border-gray-200/60">
          <Suspense fallback={null}>
            <BrandFilter
              brands={ALL_BRANDS}
              brandsWithData={brandBreakdown.map(b => b.brand)}
              selectedBrand={brandFilter}
            />
          </Suspense>
        </div>
      )}

      {/* KPI strip — sparklines on the 4 trended metrics give context at a glance */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          label="Total GMV"
          value={formatCurrency(totals.gmv)}
          trend={pctChange(totals.gmv, prevTotals.gmv)}
          trendLabel="vs prior period"
          sparklineData={aggregatedTrend.map(d => d.gmv)}
          hero
          className="col-span-2 sm:col-span-1"
        />
        <StatCard
          label="Orders"
          value={formatNumber(totals.orders)}
          trend={pctChange(totals.orders, prevTotals.orders)}
          trendLabel="vs prior period"
          sparklineData={aggregatedTrend.map(d => d.orders)}
        />
        <StatCard
          label="Items Sold"
          value={formatNumber(totals.items)}
          trend={pctChange(totals.items, prevTotals.items)}
          trendLabel="vs prior period"
          sparklineData={aggregatedTrend.map(d => d.items)}
        />
        <StatCard
          label="Videos"
          value={formatNumber(totals.videos)}
          trend={pctChange(totals.videos, prevTotals.videos)}
          trendLabel="vs prior period"
          sparklineData={aggregatedTrend.map(d => d.videos)}
        />
        <StatCard
          label="Active Creators"
          value={formatNumber(totals.creators)}
          trend={pctChange(totals.creators, prevTotals.creators)}
          trendLabel="vs prior period"
        />
        <StatCard
          label="Avg GMV / Video"
          value={totals.videos > 0 ? formatCurrency(avgGmvPerVideo) : '—'}
          trend={pctChange(avgGmvPerVideo, prevAvgGmvPerVideo)}
          trendLabel="vs prior period"
        />
      </div>

      {/* Notable Changes — auto-surfaced anomalies vs prior period */}
      <NotableChanges
        brandRiser={meaningfulRiser}
        brandFaller={meaningfulFaller}
        creatorBreakout={creatorBreakout}
        hotPost={hotPost}
      />

      {/* Performance Overview — multi-metric chart with compare toggle */}
      <PerformanceChart
        data={aggregatedTrend}
        priorData={aggregatedPrevTrend}
        accentColor={brandFilter ? (BRAND_COLORS[brandFilter] ?? undefined) : undefined}
      />

      {/* Brand breakdown — only on All Brands view with >1 brand having data */}
      {!brandFilter && brandBreakdown.length > 1 && (() => {
        const totalBrandGmv = brandBreakdown.reduce((s, b) => s + b.gmv, 0);
        return (
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-[#1A1B3A]">Brand Breakdown</h3>
                <p className="text-xs text-gray-400 mt-0.5">GMV by brand · {formatCurrency(totalBrandGmv)} total</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              {brandBreakdown.map((b) => {
                const pct      = (b.gmv / maxBrandGmv) * 100;
                const sharePct = totalBrandGmv > 0 ? (b.gmv / totalBrandGmv) * 100 : 0;
                const color    = BRAND_COLORS[b.brand] ?? '#6B7280';
                return (
                  <div key={b.brand}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-[#1A1B3A]">
                        {BRAND_DISPLAY_NAMES[b.brand] ?? b.brand}
                      </span>
                      <span className="text-xs tabular-nums font-semibold text-[#1A1B3A]">
                        {formatCurrency(b.gmv)}
                        <span className="text-gray-400 font-normal ml-1.5">{sharePct.toFixed(1)}%</span>
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-gray-400">
                        {formatNumber(b.videos)} videos · {formatNumber(b.orders)} orders
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Top Posts / Top Creators / All Detail tables removed:
            - For top posts → use /posts (sortable, full engagement metrics)
            - For top creators → use /roster's leaderboard sort
            - For per-product detail → use /brands → product tab
          Analytics is now charts-only — the "what's the trajectory" view. */}
    </div>
  );
}
