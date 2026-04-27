export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import {
  getBrandSummary, getCreatorRankings, getProductSummary, getVideoSummary, getDailyTrend,
} from '@/lib/data/rpc';
import { resolveDateRange } from '@/lib/data/date-utils';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { BrandFilter } from '@/components/creators/brand-filter';
import { AnalyticsTabs } from '@/components/analytics/analytics-tabs';
import { StatCard } from '@/components/dashboard/stat-card';
import { GmvAreaChart } from '@/components/charts/gmv-area-chart';
import { BRAND_DISPLAY_NAMES, BRAND_COLORS } from '@/lib/utils/constants';
import { createClient } from '@/lib/supabase/server';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { AlertTriangle } from 'lucide-react';

interface Props {
  searchParams: Promise<{ range?: string; brand?: string }>;
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

/** % change vs prior. undefined when prior is 0 and current is 0 too (no signal). */
function trendPct(current: number, previous: number): number | undefined {
  if (previous === 0) return current > 0 ? 100 : undefined;
  return ((current - previous) / previous) * 100;
}

export default async function AnalyticsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { startDate, endDate } = resolveDateRange(params.range);
  const { prevStart, prevEnd } = priorPeriod(startDate, endDate);

  const supabase = await createClient();
  const { getAllowedBrandsForUser } = await import('@/lib/data/brands');
  const allowedBrands = await getAllowedBrandsForUser();
  let brandsQuery = supabase.from('brands_v2').select('slug').eq('is_archived', false);
  if (allowedBrands) brandsQuery = brandsQuery.in('slug', allowedBrands);
  const { data: dbBrands } = await brandsQuery.order('name');
  const ALL_BRANDS = (dbBrands ?? []).map(b => b.slug);

  const brandFilter = params.brand && ALL_BRANDS.includes(params.brand) ? params.brand : null;
  const BRANDS = brandFilter ? [brandFilter] : ALL_BRANDS;

  // Parallel fetch: per-brand summaries (current + prior period), trend series, and entity tables
  const [
    summariesByBrand,
    prevSummariesByBrand,
    trendsByBrand,
    allCreators,
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
      try {
        const data = await getCreatorRankings(brand, startDate, endDate, 500);
        return data.map((c) => ({ ...c, brand }));
      } catch { return []; }
    })).then((r) => r.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0))),
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

  // Aggregate daily trend across brands → one merged series
  const trendByDate = new Map<string, number>();
  for (const { trend } of trendsByBrand) {
    for (const row of trend) {
      trendByDate.set(row.report_date, (trendByDate.get(row.report_date) ?? 0) + row.daily_gmv);
    }
  }
  const aggregatedTrend = Array.from(trendByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, gmv]) => ({ date, gmv }));

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

  // Maps for table rows — these still feed AnalyticsTabs
  const creators = allCreators.map((c) => ({
    creator_name: c.creator_name,
    total_videos: c.total_videos,
    total_gmv: c.total_gmv,
    total_orders: c.total_orders,
    total_items_sold: c.total_items_sold,
    avg_gmv_per_video: c.total_videos > 0 ? c.total_gmv / c.total_videos : 0,
    brand: c.brand,
  }));
  const products = allProducts.map((p) => ({
    product_name: p.product_name,
    total_items_sold: p.total_items_sold,
    total_gmv: p.total_gmv,
    total_orders: p.total_orders,
    brand: p.brand,
  }));
  const videos = allVideos.map((v) => ({
    video_title: v.video_title || 'Untitled',
    creator_name: v.creator_name,
    total_gmv: v.total_gmv,
    total_orders: v.total_orders,
    total_items_sold: v.total_items_sold,
    days_active: v.days_active,
    brand: v.brand,
  }));

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
          <p className="text-sm text-gray-400 mt-0.5">Performance insights across creators, products, and videos</p>
        </div>
        <Suspense fallback={null}>
          <DateRangePicker />
        </Suspense>
      </div>

      {/* Brand filter pills (only shown when there's >1 brand to choose from) */}
      {ALL_BRANDS.length > 1 && (
        <Suspense fallback={null}>
          <BrandFilter
            brands={ALL_BRANDS}
            brandsWithData={brandBreakdown.map(b => b.brand)}
            selectedBrand={brandFilter}
          />
        </Suspense>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          label="Total GMV"
          value={formatCurrency(totals.gmv)}
          trend={trendPct(totals.gmv, prevTotals.gmv)}
          trendLabel="vs prior period"
          hero
          className="col-span-2 sm:col-span-1"
        />
        <StatCard
          label="Orders"
          value={formatNumber(totals.orders)}
          trend={trendPct(totals.orders, prevTotals.orders)}
          trendLabel="vs prior period"
        />
        <StatCard
          label="Items Sold"
          value={formatNumber(totals.items)}
          trend={trendPct(totals.items, prevTotals.items)}
          trendLabel="vs prior period"
        />
        <StatCard
          label="Videos"
          value={formatNumber(totals.videos)}
          trend={trendPct(totals.videos, prevTotals.videos)}
          trendLabel="vs prior period"
        />
        <StatCard
          label="Active Creators"
          value={formatNumber(totals.creators)}
          trend={trendPct(totals.creators, prevTotals.creators)}
          trendLabel="vs prior period"
        />
        <StatCard
          label="Avg GMV / Video"
          value={totals.videos > 0 ? formatCurrency(avgGmvPerVideo) : '—'}
          trend={trendPct(avgGmvPerVideo, prevAvgGmvPerVideo)}
          trendLabel="vs prior period"
        />
      </div>

      {/* Charts row */}
      <div className={`grid grid-cols-1 ${!brandFilter && brandBreakdown.length > 1 ? 'lg:grid-cols-3' : 'lg:grid-cols-1'} gap-4`}>
        {/* GMV trend */}
        <div className={`rounded-2xl bg-white border border-gray-100 shadow-sm p-5 ${!brandFilter && brandBreakdown.length > 1 ? 'lg:col-span-2' : ''}`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-[#1A1B3A]">GMV Trend</h3>
              <p className="text-xs text-gray-400 mt-0.5">Daily total across selected period</p>
            </div>
            <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
              {aggregatedTrend.length} days
            </span>
          </div>
          {aggregatedTrend.length > 1 ? (
            <GmvAreaChart
              data={aggregatedTrend}
              color={brandFilter ? (BRAND_COLORS[brandFilter] ?? '#E91E8C') : '#E91E8C'}
            />
          ) : (
            <div className="h-[260px] flex items-center justify-center text-sm text-gray-400">
              Not enough data points to chart this range
            </div>
          )}
        </div>

        {/* Brand breakdown — only on All Brands view with >1 brand having data */}
        {!brandFilter && brandBreakdown.length > 1 && (
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-[#1A1B3A]">Brand Breakdown</h3>
                <p className="text-xs text-gray-400 mt-0.5">GMV by brand</p>
              </div>
            </div>
            <div className="space-y-3">
              {brandBreakdown.map((b) => {
                const pct = (b.gmv / maxBrandGmv) * 100;
                const color = BRAND_COLORS[b.brand] ?? '#6B7280';
                return (
                  <div key={b.brand}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-[#1A1B3A]">
                        {BRAND_DISPLAY_NAMES[b.brand] ?? b.brand}
                      </span>
                      <span className="text-xs tabular-nums font-semibold text-[#1A1B3A]">
                        {formatCurrency(b.gmv)}
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
        )}
      </div>

      {/* Tabbed entity tables */}
      <AnalyticsTabs creators={creators} products={products} videos={videos} />
    </div>
  );
}
