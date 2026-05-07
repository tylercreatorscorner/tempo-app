export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import {
  getAnalyticsBrandSummaries,
  getAnalyticsCreatorRankings,
  getAnalyticsVideos,
  getAnalyticsDailyTrend,
  getAnalyticsProducts,
} from '@/lib/data/rpc';
import { resolveDateRange } from '@/lib/data/date-utils';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { BrandFilter } from '@/components/creators/brand-filter';
import { PerformanceChart, type DailyMetrics } from '@/components/analytics/performance-chart';
import { NotableChanges, type BrandChange, type CreatorBreakout, type HotPost, type TopProduct } from '@/components/analytics/notable-changes';
import { BrandBreakdownDonut } from '@/components/analytics/brand-breakdown-donut';
import { AnalyticsEmptyState } from '@/components/analytics/empty-state';
import { PacingTile } from '@/components/analytics/pacing-tile';
import { ConcentrationCard, type ConcentrationStats } from '@/components/analytics/concentration-card';
import { StatCard } from '@/components/dashboard/stat-card';
import { BRAND_DISPLAY_NAMES, BRAND_COLORS, HIDDEN_FROM_PICKER, expandBrandToDataSlugs } from '@/lib/utils/constants';
import { pctChange } from '@/lib/utils/trend';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { AlertTriangle } from 'lucide-react';

/** Number of days behind the current date before we surface the "data is stale" banner. */
const STALE_DAYS_THRESHOLD = 3;

interface Props {
  searchParams: Promise<{ range?: string; brand?: string; start?: string; end?: string }>;
}

const fmtISO = (d: Date) => d.toISOString().split('T')[0];

/** Compute the prior period — same length, immediately preceding the current range. */
function priorPeriod(startDate: string, endDate: string): { prevStart: string; prevEnd: string } {
  const start = new Date(startDate);
  const end   = new Date(endDate);
  const days  = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevEnd   = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  return { prevStart: fmtISO(prevStart), prevEnd: fmtISO(prevEnd) };
}

/** Same date range one year earlier — for the YoY overlay. */
function yoyPeriod(startDate: string, endDate: string): { start: string; end: string } {
  const shift = (s: string) => {
    const d = new Date(s);
    d.setFullYear(d.getFullYear() - 1);
    return fmtISO(d);
  };
  return { start: shift(startDate), end: shift(endDate) };
}

/** Inclusive list of YYYY-MM-DD strings between two dates. */
function dateRange(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur <= end) {
    out.push(fmtISO(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export default async function AnalyticsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { startDate, endDate, preset } = resolveDateRange(params.range, params.start, params.end);
  const { prevStart, prevEnd } = priorPeriod(startDate, endDate);

  const supabase = await createClient();
  const { getAllowedBrandsForUser } = await import('@/lib/data/brands');
  const allowedBrands = await getAllowedBrandsForUser();
  // Pull id+slug so we can resolve roster slugs to the brand_ids the new
  // analytics_* RPCs expect (id-keyed instead of text-keyed).
  let brandsQuery = supabase.from('brands_v2').select('id, slug').eq('is_archived', false);
  if (allowedBrands) brandsQuery = brandsQuery.in('slug', allowedBrands);
  const { data: dbBrands } = await brandsQuery.order('name');
  const slugToId = new Map<string, string>();
  for (const b of dbBrands ?? []) slugToId.set(b.slug, b.id);
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
  // Expand the brand filter to data slugs (e.g. 'leefar' → both stores), then
  // resolve slugs → brand_ids for the analytics_* RPCs. brands_v2 has rows for
  // both umbrella ('leefar') and child stores ('leefar_nutrition', etc.) — we
  // want the children since that's what the stats tables key on.
  const dataSlugs = brandFilter
    ? Array.from(expandBrandToDataSlugs(brandFilter))
    : ALL_BRANDS.flatMap(b => Array.from(expandBrandToDataSlugs(b)));
  const BRAND_IDS = dataSlugs
    .map(s => slugToId.get(s))
    .filter((id): id is string => Boolean(id));

  // Same range a year prior — for the YoY overlay in PerformanceChart
  const yoy = yoyPeriod(startDate, endDate);

  // Single multi-brand call per period × per dataset — collapses the old
  // 5×N×3 fan-out (≈30+ round-trips for 5 brands) down to 10 RPCs flat.
  const [
    brandSummariesCur,
    brandSummariesPrev,
    trendCur,
    trendPrev,
    trendYoy,
    creatorsCur,
    creatorsPrev,
    videosRaw,
    productsCur,
    productsPrev,
  ] = await Promise.all([
    getAnalyticsBrandSummaries(BRAND_IDS, startDate, endDate).catch(() => []),
    getAnalyticsBrandSummaries(BRAND_IDS, prevStart, prevEnd).catch(() => []),
    getAnalyticsDailyTrend(BRAND_IDS, startDate, endDate).catch(() => []),
    getAnalyticsDailyTrend(BRAND_IDS, prevStart, prevEnd).catch(() => []),
    getAnalyticsDailyTrend(BRAND_IDS, yoy.start, yoy.end).catch(() => []),
    getAnalyticsCreatorRankings(BRAND_IDS, startDate, endDate, 500).catch(() => []),
    getAnalyticsCreatorRankings(BRAND_IDS, prevStart, prevEnd, 500).catch(() => []),
    getAnalyticsVideos(BRAND_IDS, startDate, endDate, 200).catch(() => []),
    getAnalyticsProducts(BRAND_IDS, startDate, endDate, 50).catch(() => []),
    getAnalyticsProducts(BRAND_IDS, prevStart, prevEnd, 200).catch(() => []),
  ]);

  // Light-weight reshape so the rest of this page can stay slug-keyed while the
  // data layer migrates to brand_id-keyed v2 stats tables.
  const allCreators = [...creatorsCur].sort((a, b) => b.total_gmv - a.total_gmv);
  const prevAllCreators = creatorsPrev;
  const allVideos = videosRaw;

  // Aggregate totals across all queried brands
  const totals = brandSummariesCur.reduce((acc, s) => {
    acc.gmv      += s.total_gmv;
    acc.orders   += s.total_orders;
    acc.items    += s.total_items_sold;
    acc.videos   += s.total_videos;
    acc.creators += s.unique_creators;
    return acc;
  }, { gmv: 0, orders: 0, items: 0, videos: 0, creators: 0 });

  const prevTotals = brandSummariesPrev.reduce((acc, s) => {
    acc.gmv      += s.total_gmv;
    acc.orders   += s.total_orders;
    acc.items    += s.total_items_sold;
    acc.videos   += s.total_videos;
    acc.creators += s.unique_creators;
    return acc;
  }, { gmv: 0, orders: 0, items: 0, videos: 0, creators: 0 });

  // Per-order economics — answers "what's the basket math right now?"
  const aov           = totals.orders > 0 ? totals.gmv   / totals.orders : 0;
  const prevAov       = prevTotals.orders > 0 ? prevTotals.gmv   / prevTotals.orders : 0;
  const itemsPerOrder = totals.orders > 0 ? totals.items / totals.orders : 0;
  const prevItemsPerOrder = prevTotals.orders > 0 ? prevTotals.items / prevTotals.orders : 0;

  // Managed-vs-unmanaged GMV split — agency-relevant. Sum only creators flagged
  // is_managed via the (handle|brand_slug) lookup against managed_creators.
  const managedGmv = creatorsCur.reduce(
    (s, c) => s + (managedSet.has(`${norm(c.creator_name)}|||${c.brand_slug}`) ? c.total_gmv : 0),
    0,
  );
  const prevManagedGmv = creatorsPrev.reduce(
    (s, c) => s + (managedSet.has(`${norm(c.creator_name)}|||${c.brand_slug}`) ? c.total_gmv : 0),
    0,
  );
  const managedShare     = totals.gmv > 0 ? (managedGmv     / totals.gmv)     * 100 : 0;
  const prevManagedShare = prevTotals.gmv > 0 ? (prevManagedGmv / prevTotals.gmv) * 100 : 0;

  // Aggregate daily trend across brands — keep all 4 metrics for the multi-metric chart.
  // Zero-fills missing dates so current/prior/YoY series have identical length, which
  // makes index-aligned overlays in PerformanceChart actually work.
  // analytics_daily_trend already returns one row per date aggregated across
  // brand_ids — we just zero-fill missing dates so current/prior/YoY series
  // share identical length, which makes index-aligned overlays in
  // PerformanceChart actually work.
  const buildTrend = (
    rows: Awaited<ReturnType<typeof getAnalyticsDailyTrend>>,
    rangeStart: string,
    rangeEnd: string,
  ): DailyMetrics[] => {
    const byDate = new Map<string, { gmv: number; orders: number; items: number; videos: number }>();
    for (const row of rows) {
      byDate.set(row.report_date, {
        gmv: row.daily_gmv,
        orders: row.daily_orders,
        items: row.daily_items_sold,
        videos: row.daily_videos,
      });
    }
    return dateRange(rangeStart, rangeEnd).map((date) => ({
      date,
      ...(byDate.get(date) ?? { gmv: 0, orders: 0, items: 0, videos: 0 }),
    }));
  };
  const aggregatedTrend     = buildTrend(trendCur,  startDate, endDate);
  const aggregatedPrevTrend = buildTrend(trendPrev, prevStart, prevEnd);
  const aggregatedYoyTrend  = buildTrend(trendYoy,  yoy.start, yoy.end);
  const yoyHasData = aggregatedYoyTrend.some(d => d.gmv > 0 || d.orders > 0 || d.videos > 0);

  // Stale-data check — find the latest date that actually has data (not a zero-fill).
  // After zero-filling, aggregatedTrend always spans the full range, so we can't just
  // grab the last element.
  const latestRealDate = [...aggregatedTrend]
    .reverse()
    .find(d => d.gmv > 0 || d.orders > 0 || d.videos > 0)?.date ?? null;
  const daysStale = latestRealDate
    ? Math.floor((Date.now() - new Date(latestRealDate).getTime()) / 86400000)
    : null;
  const isStale = daysStale != null && daysStale > STALE_DAYS_THRESHOLD;

  // Brand breakdown for the "All Brands" view — sorted by GMV desc
  const brandBreakdown = brandSummariesCur
    .map(s => ({
      brand: s.brand_slug,
      gmv: s.total_gmv,
      orders: s.total_orders,
      videos: s.total_videos,
    }))
    .filter(b => b.gmv > 0)
    .sort((a, b) => b.gmv - a.gmv);

  // Creator list with managed-status flag — fed into the breakout-detection pass below.
  // is_managed is set by cross-referencing the (handle|brand_slug) tuple against managed_creators.
  const creators = allCreators.map((c) => {
    const key = `${norm(c.creator_name)}|||${c.brand_slug}`;
    const managedId = managedSet.get(key) ?? null;
    return {
      creator_name: c.creator_name,
      total_gmv: c.total_gmv,
      brand: c.brand_slug,
      is_managed: managedId !== null,
      managed_id: managedId,
    };
  });

  // ─── Notable Changes computation ──────────────────────────────────────────
  // Top brand riser/faller — compare current vs prior period
  const prevByBrand = new Map<string, number>();
  for (const s of brandSummariesPrev) prevByBrand.set(s.brand_slug, s.total_gmv);

  const brandDeltas: BrandChange[] = brandSummariesCur
    .map(s => {
      const cur = s.total_gmv;
      const pri = prevByBrand.get(s.brand_slug) ?? 0;
      const delta_pct = pri === 0 ? (cur > 0 ? 100 : 0) : ((cur - pri) / pri) * 100;
      return { brand: s.brand_slug, current: cur, prior: pri, delta_pct };
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
    const key = `${norm(c.creator_name)}|||${c.brand_slug}`;
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
        brand: v.brand_slug,
        total_gmv: v.total_gmv,
        days_active: v.days_active,
        velocity,
      };
    }
  }

  // Top product — best-selling product right now, with its delta vs prior period.
  // analytics_products already returns sorted by GMV desc, so productsCur[0] is the
  // top performer. We look up the same (brand, product_name) in the prior fetch
  // for the comparison; if it didn't exist or had zero GMV, delta is unknown.
  const topProductRow = productsCur[0] ?? null;
  const topProduct: TopProduct | null = topProductRow ? (() => {
    const priorRow = productsPrev.find(
      p => p.brand_slug === topProductRow.brand_slug && p.product_name === topProductRow.product_name,
    );
    const priorGmv = priorRow?.total_gmv ?? 0;
    const deltaPct = priorGmv === 0
      ? (topProductRow.total_gmv > 0 ? 100 : 0)
      : ((topProductRow.total_gmv - priorGmv) / priorGmv) * 100;
    return {
      product_name: topProductRow.product_name,
      brand: topProductRow.brand_slug,
      current_gmv: topProductRow.total_gmv,
      prior_gmv: priorGmv,
      delta_pct: deltaPct,
    };
  })() : null;

  // ─── Pacing — only for in-progress periods (today: just "thisMonth") ──────
  // Linear projection: run-rate × period length. Skipped when the date range is
  // already complete (last7, last30, lastMonth, custom ranges, etc.) because
  // there's nothing to project — what you see is what you got.
  const pacing = (() => {
    if (preset !== 'thisMonth') return null;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysElapsed = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    // Period = full calendar month containing startDate
    const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
    const monthEnd   = new Date(start.getFullYear(), start.getMonth() + 1, 0); // last day of month
    const periodLength = Math.round((monthEnd.getTime() - monthStart.getTime()) / 86400000) + 1;
    if (daysElapsed >= periodLength) return null; // month is already over
    return {
      daysElapsed,
      periodLength,
      gmvToDate: totals.gmv,
      periodLabel: monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    };
  })();

  // ─── Creator concentration — Top 1 / 5 / 10 / 25 share of GMV ─────────────
  // allCreators is already sorted GMV desc by the RPC. Just take prefix sums.
  const cumGmv = (n: number) =>
    allCreators.slice(0, n).reduce((s, c) => s + c.total_gmv, 0);
  const concentrationStats: ConcentrationStats = {
    totalCreators: allCreators.length,
    totalGmv: totals.gmv,
    top1Gmv:  cumGmv(1),
    top5Gmv:  cumGmv(5),
    top10Gmv: cumGmv(10),
    top25Gmv: cumGmv(25),
  };
  // Hide the card when we don't have enough creators to make the framing meaningful
  const showConcentration = allCreators.length >= 10 && totals.gmv > 0;

  return (
    <div className="space-y-6">
      {/* Pacing tile — only shows on month-to-date views (in-progress period) */}
      {pacing && (
        <PacingTile
          daysElapsed={pacing.daysElapsed}
          periodLength={pacing.periodLength}
          gmvToDate={pacing.gmvToDate}
          periodLabel={pacing.periodLabel}
        />
      )}

      {/* Stale-data banner */}
      {isStale && latestRealDate && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">
              Performance data is {daysStale} days old
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Last data point: {new Date(latestRealDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
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
            {latestRealDate && daysStale != null && (
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

      {/* If every fetched metric is zero AND the trend is empty, show a real empty state
          rather than six "$0" cards and a flat chart — much clearer "no data" signal. */}
      {totals.gmv === 0 && totals.orders === 0 && totals.videos === 0 && latestRealDate === null ? (
        <AnalyticsEmptyState
          rangeLabel={`${new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
        />
      ) : (
      <>
      {/* KPI strip — 7 cards (hero spans 2 cols). Trended metrics (GMV, Orders,
          Videos) carry sparklines; derived ratios (AOV, Items/Order, Active
          Creators, Managed Share) don't because they'd need a separate per-day
          fetch. Items Sold + Avg GMV/Video dropped — AOV and Managed Share carry
          more decision-making weight for an agency exec. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
        <StatCard
          label="Total GMV"
          value={formatCurrency(totals.gmv)}
          trend={pctChange(totals.gmv, prevTotals.gmv)}
          trendLabel="vs prior period"
          sparklineData={aggregatedTrend.map(d => d.gmv)}
          hero
          className="col-span-2 sm:col-span-2 lg:col-span-2"
        />
        <StatCard
          label="Orders"
          value={formatNumber(totals.orders)}
          trend={pctChange(totals.orders, prevTotals.orders)}
          trendLabel="vs prior period"
          sparklineData={aggregatedTrend.map(d => d.orders)}
        />
        <StatCard
          label="AOV"
          value={totals.orders > 0 ? formatCurrency(aov) : '—'}
          trend={pctChange(aov, prevAov)}
          trendLabel="vs prior period"
        />
        <StatCard
          label="Items / Order"
          value={totals.orders > 0 ? itemsPerOrder.toFixed(2) : '—'}
          trend={pctChange(itemsPerOrder, prevItemsPerOrder)}
          trendLabel="vs prior period"
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
          label="Managed Share"
          value={totals.gmv > 0 ? `${managedShare.toFixed(0)}%` : '—'}
          trend={pctChange(managedShare, prevManagedShare)}
          trendLabel="vs prior period"
        />
      </div>

      {/* Notable Changes — auto-surfaced anomalies vs prior period */}
      <NotableChanges
        brandRiser={meaningfulRiser}
        brandFaller={meaningfulFaller}
        creatorBreakout={creatorBreakout}
        hotPost={hotPost}
        topProduct={topProduct}
      />

      {/* Performance Overview — multi-metric chart with prior-period and YoY compare toggles */}
      <PerformanceChart
        data={aggregatedTrend}
        priorData={aggregatedPrevTrend}
        yoyData={yoyHasData ? aggregatedYoyTrend : undefined}
        accentColor={brandFilter ? (BRAND_COLORS[brandFilter] ?? undefined) : undefined}
      />

      {/* Brand breakdown — only on All Brands view with >1 brand having data */}
      {!brandFilter && brandBreakdown.length > 1 && (
        <BrandBreakdownDonut rows={brandBreakdown} />
      )}

      {/* Creator concentration — surfaces "single-creator dependence" risk */}
      {showConcentration && <ConcentrationCard stats={concentrationStats} />}
      </>
      )}

      {/* Top Posts / Top Creators / All Detail tables removed:
            - For top posts → use /posts (sortable, full engagement metrics)
            - For top creators → use /roster's leaderboard sort
            - For per-product detail → use /brands → product tab
          Analytics is now charts-only — the "what's the trajectory" view. */}
    </div>
  );
}
