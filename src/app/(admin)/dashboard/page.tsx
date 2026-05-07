export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { format, subDays, differenceInDays } from 'date-fns';

import { getBrandSummary, getCreatorRankings, getDailyTrend } from '@/lib/data/rpc';
import { resolveDateRange } from '@/lib/data/date-utils';
import { aggregateCreatorsByRealName, computeManagedGmvByBrand } from '@/lib/data/creator-aggregate';
import { getCreatorRetainers } from '@/lib/data/retainer';
import { buildCreatorAlerts } from '@/lib/data/creator-alerts';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { pctChange } from '@/lib/utils/trend';
import {
  BRAND_COLORS,
  BRAND_DISPLAY_NAMES,
  HIDDEN_FROM_PICKER,
  expandBrandToDataSlugs,
} from '@/lib/utils/constants';
import { createClient } from '@/lib/supabase/server';
import { getActiveTenantId } from '@/lib/auth/platform-admin';

import { StatCard } from '@/components/dashboard/stat-card';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { DailyBrief, type DailyBriefActionItem } from '@/components/dashboard/daily-brief';
import { CommunityHighlights } from '@/components/dashboard/community-highlights';
import { CreatorAlerts } from '@/components/dashboard/creator-alerts';
import { BrandPerformance, type BrandRowData } from '@/components/dashboard/brand-performance';
import { StaleDataBanner } from '@/components/dashboard/stale-data-banner';
import { DashboardOnboarding } from '@/components/dashboard/dashboard-onboarding';
import { TodaysStandouts, TodaysStandoutsSkeleton } from '@/components/dashboard/todays-standouts';

interface Props {
  searchParams: Promise<{ range?: string; brand?: string }>;
}

/** Friendly labels for the date-range presets that drive the Period Brief. */
const PRESET_LABELS: Record<string, { current: string; prior: string }> = {
  today:        { current: 'Today',          prior: 'yesterday' },
  yesterday:    { current: 'Yesterday',      prior: 'the day before' },
  last7:        { current: 'Last 7 days',    prior: 'prior 7 days' },
  last14:       { current: 'Last 14 days',   prior: 'prior 14 days' },
  last30:       { current: 'Last 30 days',   prior: 'prior 30 days' },
  thisMonth:    { current: 'This month',     prior: 'last month' },
  lastMonth:    { current: 'Last month',     prior: 'the month before' },
  thisQuarter:  { current: 'This quarter',   prior: 'last quarter' },
};

function getPeriodLabels(preset: string | undefined, startDate: string, endDate: string, prevStartDate: string, prevEndDate: string) {
  const known = preset ? PRESET_LABELS[preset] : undefined;
  if (known) return known;
  const fmt = (d: string) => format(new Date(d), 'MMM d');
  return {
    current: `${fmt(startDate)} – ${fmt(endDate)}`,
    prior: `${fmt(prevStartDate)} – ${fmt(prevEndDate)}`,
  };
}

export default async function AdminDashboard({ searchParams }: Props) {
  const params = await searchParams;
  const { startDate, endDate, preset } = resolveDateRange(params.range);

  // ── Tenant + brand context ──────────────────────────────────────────────
  const supabase = await createClient();
  const activeTenantId = await getActiveTenantId();
  const { getAllowedBrandsForUser } = await import('@/lib/data/brands');
  const allowedBrands = await getAllowedBrandsForUser();

  let brandsQuery = supabase.from('brands_v2').select('slug').eq('is_archived', false).order('name');
  if (activeTenantId) brandsQuery = brandsQuery.eq('tenant_id', activeTenantId);
  if (allowedBrands)  brandsQuery = brandsQuery.in('slug', allowedBrands);
  const { data: dbBrands } = await brandsQuery;
  const ALL_BRANDS = (dbBrands ?? []).map(b => b.slug).filter(s => !HIDDEN_FROM_PICKER.has(s));

  // ── Empty-tenant onboarding ─────────────────────────────────────────────
  if (ALL_BRANDS.length === 0) {
    const { data: { user } } = await supabase.auth.getUser();
    let tenantData: { tiktok_connected: boolean; stripe_subscription_id: string | null; creators_added: boolean; discord_connected: boolean } | null = null;
    if (user) {
      const { data: profile } = await supabase.from('user_profiles').select('tenant_id').eq('user_id', user.id).maybeSingle();
      if (profile?.tenant_id) {
        const { data: t } = await supabase.from('tenants').select('tiktok_connected, stripe_subscription_id, creators_added, discord_connected').eq('id', profile.tenant_id).single();
        tenantData = t;
      }
    }
    return (
      <DashboardOnboarding
        tiktokConnected={tenantData?.tiktok_connected ?? false}
        planActive={!!tenantData?.stripe_subscription_id}
        creatorsAdded={tenantData?.creators_added ?? false}
        discordConnected={tenantData?.discord_connected ?? false}
      />
    );
  }

  // ── Resolve brand filter + expand to data slugs ─────────────────────────
  const brandFilter = params.brand && ALL_BRANDS.includes(params.brand) ? params.brand : null;
  const activeRosterBrands = brandFilter ? [brandFilter] : ALL_BRANDS;
  const activeBrands = activeRosterBrands.flatMap(b => Array.from(expandBrandToDataSlugs(b)));

  // ── Period bookkeeping ──────────────────────────────────────────────────
  const periodLength    = differenceInDays(new Date(endDate), new Date(startDate)) + 1;
  const prevEnd         = subDays(new Date(startDate), 1);
  const prevStart       = subDays(prevEnd, periodLength - 1);
  const prevStartDate   = format(prevStart, 'yyyy-MM-dd');
  const prevEndDate     = format(prevEnd, 'yyyy-MM-dd');
  const labels          = getPeriodLabels(preset, startDate, endDate, prevStartDate, prevEndDate);

  // ── Single parallel fetch ───────────────────────────────────────────────
  async function fetchSummary(brand: string, start: string, end: string) {
    try { return { brand, data: (await getBrandSummary(brand, start, end))[0] ?? null }; }
    catch { return { brand, data: null }; }
  }

  const [
    summaries,
    prevSummaries,
    creatorsNested,
    retainerMap,
    trendsByBrandRaw,
  ] = await Promise.all([
    Promise.all(activeBrands.map(b => fetchSummary(b, startDate,     endDate))),
    Promise.all(activeBrands.map(b => fetchSummary(b, prevStartDate, prevEndDate))),
    Promise.all(activeBrands.map(async (brand) => {
      try { return (await getCreatorRankings(brand, startDate, endDate, 50)).map((c) => ({ ...c, brand })); }
      catch { return []; }
    })),
    getCreatorRetainers(),
    Promise.all(activeBrands.map(b => getDailyTrend(b, startDate, endDate).catch(() => []))),
  ]);

  // ── Aggregate trend across active brands ────────────────────────────────
  const trendByDate = new Map<string, number>();
  for (const brandTrend of trendsByBrandRaw) {
    for (const day of brandTrend) {
      trendByDate.set(day.report_date, (trendByDate.get(day.report_date) ?? 0) + day.daily_gmv);
    }
  }
  const aggregatedTrend = Array.from(trendByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, gmv]) => ({ date, gmv }));

  // ── Creator-side parallel fetch: managed-GMV-by-brand (for the
  //    BrandPerformance "Managed" column) and the grouped creator list
  //    (for highlights, alerts, top-creator). Both share an underlying
  //    handle→creator lookup; running them in parallel keeps it to the
  //    same wall-clock time as one query. ─────────────────────────────────
  const allCreators = creatorsNested.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0));
  const [managedGmvByBrand, groupedCreators] = await Promise.all([
    computeManagedGmvByBrand(allCreators),
    aggregateCreatorsByRealName(allCreators, brandFilter),
  ]);

  // ── Per-roster-brand stats — drives BrandPerformance card and the
  //    "Top Brand" mini-stat in the Period Brief. Aggregates across
  //    data slugs (e.g. leefar_nutrition + leefar_supplements → leefar). ──
  const rosterBrandStats: BrandRowData[] = activeRosterBrands.map((rosterSlug) => {
    const dataSlugSet = new Set(expandBrandToDataSlugs(rosterSlug));
    let currentGmv = 0;
    let prevGmv    = 0;
    let managedGmvForBrand = 0;
    for (const s of summaries)     if (dataSlugSet.has(s.brand)) currentGmv += s.data?.total_gmv ?? 0;
    for (const s of prevSummaries) if (dataSlugSet.has(s.brand)) prevGmv    += s.data?.total_gmv ?? 0;
    for (const ds of dataSlugSet)  managedGmvForBrand += managedGmvByBrand.get(ds) ?? 0;

    // Sparkline = daily GMV across this brand's data slugs
    const sparkByDate = new Map<string, number>();
    for (let i = 0; i < activeBrands.length; i++) {
      if (!dataSlugSet.has(activeBrands[i])) continue;
      for (const day of trendsByBrandRaw[i]) {
        sparkByDate.set(day.report_date, (sparkByDate.get(day.report_date) ?? 0) + day.daily_gmv);
      }
    }
    const sparkline = Array.from(sparkByDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, gmv]) => gmv);

    return {
      slug: rosterSlug,
      currentGmv,
      managedGmv: managedGmvForBrand,
      prevGmv,
      trend: pctChange(currentGmv, prevGmv),
      sparkline,
    };
  });

  // Brand movers used to live here too — they're now exclusive to /analytics's
  // Notable Changes section so the same period-vs-prior comparison only has
  // one canonical home.

  // Top brand — used by the Period Brief mini-stat on All Brands view.
  const topBrandStat = !brandFilter
    ? [...rosterBrandStats].sort((a, b) => b.currentGmv - a.currentGmv)[0]
    : null;
  const topBrandForBrief = topBrandStat && topBrandStat.currentGmv > 0
    ? { name: BRAND_DISPLAY_NAMES[topBrandStat.slug] ?? topBrandStat.slug, gmv: topBrandStat.currentGmv }
    : null;

  // ── Managed/unmanaged GMV split (portfolio-level — feeds the KPI card) ──
  let managedGmv = 0;
  let unmanagedGmv = 0;
  for (const c of groupedCreators) {
    if (c.isManaged) managedGmv   += c.total_gmv;
    else             unmanagedGmv += c.total_gmv;
  }

  // ── Portfolio totals ────────────────────────────────────────────────────
  const totals = summaries.reduce((acc, { data }) => {
    if (!data) return acc;
    acc.gmv      += data.total_gmv      ?? 0;
    acc.orders   += data.total_orders   ?? 0;
    acc.items    += data.total_items_sold ?? 0;
    acc.creators += data.unique_creators ?? 0;
    acc.videos   += data.total_videos   ?? 0;
    return acc;
  }, { gmv: 0, orders: 0, items: 0, creators: 0, videos: 0 });

  const prevTotals = prevSummaries.reduce((acc, { data }) => {
    if (!data) return acc;
    acc.gmv    += data.total_gmv    ?? 0;
    acc.orders += data.total_orders ?? 0;
    return acc;
  }, { gmv: 0, orders: 0 });

  const gmvTrend    = pctChange(totals.gmv,    prevTotals.gmv);
  const ordersTrend = pctChange(totals.orders, prevTotals.orders);

  // ROI = current GMV / total retainer spend (on active managed creators)
  let totalRetainerSpend = 0;
  for (const [, info] of retainerMap) totalRetainerSpend += info.retainer ?? 0;
  const roi = totalRetainerSpend > 0 ? totals.gmv / totalRetainerSpend : 0;
  const managedSharePct = totals.gmv > 0 ? (managedGmv / totals.gmv) * 100 : 0;

  // ── Creator alerts (single source of truth for brief + sidecard) ─────
  const allAlerts = buildCreatorAlerts(groupedCreators);
  const briefActionItems: DailyBriefActionItem[] = allAlerts.slice(0, 3).map((a) => ({
    name: a.name,
    type: a.type,
    detail: a.detail,
  }));

  // ── Stale-data check ────────────────────────────────────────────────────
  const latestDate = aggregatedTrend.length > 0 ? aggregatedTrend[aggregatedTrend.length - 1].date : null;
  const daysStale  = latestDate ? Math.floor((Date.now() - new Date(latestDate).getTime()) / 86400000) : null;
  const isStale    = daysStale != null && daysStale > 3;

  // ── Header copy ─────────────────────────────────────────────────────────
  const activeBrandColor = brandFilter ? BRAND_COLORS[brandFilter] ?? null : null;
  const activeBrandName  = brandFilter ? BRAND_DISPLAY_NAMES[brandFilter] ?? brandFilter : null;
  const headerLabel      = brandFilter ? `${activeBrandName} Today` : 'Today';
  const headerSub        = brandFilter ? 'Brand performance brief' : 'Portfolio brief';
  const dataThroughLabel = latestDate
    ? `Data through ${format(new Date(latestDate), 'MMM d, yyyy')}`
    : 'Awaiting first data sync';

  const isEmptyBrand = brandFilter && totals.gmv === 0 && totals.orders === 0;

  return (
    <div className="space-y-6">
      {/* Stale-data warning — shows when the freshest data point is >3 days old */}
      {isStale && latestDate && daysStale != null && (
        <StaleDataBanner latestDate={latestDate} daysStale={daysStale} />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1A1B3A]">{headerLabel}</h1>
          <p className="text-sm text-gray-500 mt-1">{headerSub}</p>
          <p className="text-xs text-gray-400 mt-1 inline-flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${isStale ? 'bg-amber-400' : 'bg-green-400'}`} />
            {dataThroughLabel}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Suspense fallback={null}>
            <DateRangePicker />
          </Suspense>
        </div>
      </div>

      {/* Period Brief — narrative-led hero (all date ranges).
          On All Brands view we surface Top Brand instead of Top Creator —
          that's the more actionable signal for an agency-style operator. */}
      <DailyBrief
        brandName={activeBrandName}
        periodLabel={labels.current}
        prevPeriodLabel={labels.prior}
        currentGmv={totals.gmv}
        prevGmv={prevTotals.gmv}
        currentOrders={totals.orders}
        prevOrders={prevTotals.orders}
        currentVideos={totals.videos}
        currentCreators={totals.creators}
        gmvTrend={gmvTrend}
        topCreator={groupedCreators[0] ? { name: groupedCreators[0].display_name, gmv: groupedCreators[0].total_gmv } : null}
        topBrand={topBrandForBrief}
        actionItems={briefActionItems}
        color={activeBrandColor ?? '#FF4D8D'}
      />

      {/* KPI strip — 4 focused metrics with sparklines */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        <StatCard
          label="Total GMV"
          value={formatCurrency(totals.gmv)}
          trend={gmvTrend}
          trendLabel="vs prior period"
          brandColor={activeBrandColor}
          hero
          sparklineData={aggregatedTrend.length > 1 ? aggregatedTrend.map(d => d.gmv) : undefined}
        />
        <StatCard
          label="Orders"
          value={formatNumber(totals.orders)}
          trend={ordersTrend}
          trendLabel="vs prior period"
          accentColor="#7C5CFC"
        />
        <StatCard
          label="Managed Share"
          value={totals.gmv > 0 ? `${managedSharePct.toFixed(0)}%` : '—'}
          accentColor="#10B981"
          subValue={
            totals.gmv > 0
              ? `${formatCurrency(managedGmv)} managed · ${formatCurrency(unmanagedGmv)} unmanaged`
              : undefined
          }
        />
        <StatCard
          label="ROI"
          value={roi > 0 ? `${roi.toFixed(1)}x` : 'N/A'}
          accentColor={activeBrandColor ?? '#FF4D8D'}
          subValue={totalRetainerSpend > 0 ? `on ${formatCurrency(totalRetainerSpend)} retainer` : undefined}
        />
      </div>

      {/* Empty-state for a brand-filtered view with no activity */}
      {isEmptyBrand && (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="text-4xl mb-3">📊</div>
            <h3 className="text-lg font-bold">No data for {activeBrandName} in this period</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm">
              Try a different date range, or check back once creators have activity in this period.
            </p>
            <a
              href="?range=last7"
              className="mt-5 inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-white border border-gray-200 text-[#1A1B3A] text-sm font-semibold hover:bg-gray-50 transition-colors"
            >
              View Last 7 Days →
            </a>
          </div>
        </div>
      )}

      {/* Brand Performance — multi-brand-only. The agency operator's most
          important section: brand-by-brand GMV / trend / sparkline, with
          click-to-filter. Only renders for tenants with >1 brand on the
          unfiltered All Brands view. */}
      {!brandFilter && rosterBrandStats.length > 1 && (
        <BrandPerformance brands={rosterBrandStats} range={params.range} />
      )}

      {/* Highlights + Alerts — paired, complementary creator views.
          Alerts also surfaces brand riser/faller when on All Brands view. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CommunityHighlights creators={groupedCreators} />
        <CreatorAlerts alerts={allAlerts} />
      </div>

      {/* Today's Standouts — single curated video section, streams in via Suspense */}
      <Suspense fallback={<TodaysStandoutsSkeleton />}>
        <TodaysStandouts brandFilter={brandFilter} startDate={startDate} endDate={endDate} />
      </Suspense>
    </div>
  );
}
