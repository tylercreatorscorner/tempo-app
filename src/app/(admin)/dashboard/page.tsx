export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { BarChart3 } from 'lucide-react';
import { format, subDays, differenceInDays } from 'date-fns';

import { getCreatorRankings, getDailyTrend, getAnalyticsBrandSummaries } from '@/lib/data/rpc';
import { resolveDateRange } from '@/lib/data/date-utils';
import { aggregateCreatorsByRealName } from '@/lib/data/creator-aggregate';
import { computeManagedGmv } from '@/lib/data/managed-gmv';
import { getCreatorRetainers } from '@/lib/data/retainer';
import { buildCreatorAlerts } from '@/lib/data/creator-alerts';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { pctChange } from '@/lib/utils/trend';
import { getBrandRegistry, brandLabel, expandSlugs } from '@/lib/data/brand-registry';
import { createClient } from '@/lib/supabase/server';
import { getActiveTenantId } from '@/lib/auth/platform-admin';

import { StatCard } from '@/components/dashboard/stat-card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { CommunityHighlights } from '@/components/dashboard/community-highlights';
import { CreatorAlerts } from '@/components/dashboard/creator-alerts';
import { BrandPerformance, type BrandRowData } from '@/components/dashboard/brand-performance';
import { StaleDataBanner } from '@/components/dashboard/stale-data-banner';
import { DashboardOnboarding } from '@/components/dashboard/dashboard-onboarding';
import { TodaysStandouts, TodaysStandoutsSkeleton } from '@/components/dashboard/todays-standouts';
import { PerformanceChart } from '@/components/analytics/performance-chart';
import { NotableChanges } from '@/components/analytics/notable-changes';
import { PacingTile } from '@/components/analytics/pacing-tile';
import { getFoldInAnalytics } from '@/lib/data/dashboard-fold-analytics';

interface Props {
  searchParams: Promise<{ range?: string; brand?: string }>;
}

export default async function AdminDashboard({ searchParams }: Props) {
  const params = await searchParams;
  const { startDate, endDate, preset } = resolveDateRange(params.range);

  // ── Tenant + brand context ──────────────────────────────────────────────
  const supabase = await createClient();
  const reg = await getBrandRegistry();
  const activeTenantId = await getActiveTenantId();
  const { getAllowedBrandsForUser } = await import('@/lib/data/brands');
  const allowedBrands = await getAllowedBrandsForUser();

  let brandsQuery = supabase.from('brands_v2').select('slug').eq('is_archived', false).order('name');
  if (activeTenantId) brandsQuery = brandsQuery.eq('tenant_id', activeTenantId);
  if (allowedBrands)  brandsQuery = brandsQuery.in('slug', allowedBrands);
  const { data: dbBrands } = await brandsQuery;
  const hiddenSlugs = new Set(reg.rows.filter(r => r.parent_brand_id != null).map(r => r.slug));
  const ALL_BRANDS = (dbBrands ?? []).map(b => b.slug).filter(s => !hiddenSlugs.has(s));

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
  const activeBrands = activeRosterBrands.flatMap(b => expandSlugs(reg, b));
  // brand_ids for the multi-brand analytics_* RPCs (shared with the fold-in helper).
  // Resolve via the registry (has every brand's id) rather than the allowedBrands-
  // scoped brands_v2 read above, so umbrella-scoped managers still resolve their
  // child stores. activeBrands is already tenant/allowed-scoped, so this stays safe.
  const BRAND_IDS = activeBrands.map(s => reg.bySlug.get(s)?.id).filter((id): id is string => Boolean(id));

  // ── Period bookkeeping ──────────────────────────────────────────────────
  const periodLength    = differenceInDays(new Date(endDate), new Date(startDate)) + 1;
  const prevEnd         = subDays(new Date(startDate), 1);
  const prevStart       = subDays(prevEnd, periodLength - 1);
  const prevStartDate   = format(prevStart, 'yyyy-MM-dd');
  const prevEndDate     = format(prevEnd, 'yyyy-MM-dd');

  // ── Single parallel fetch ───────────────────────────────────────────────
  // Brand summaries come from the multi-brand analytics_* RPC (one call each for
  // current + prior) instead of a per-brand fan-out — verified identical to the
  // per-brand sum (GMV/orders/videos/creators match to the penny). The arrays are
  // also handed to the fold-in helper so it doesn't re-fetch them.
  const [
    brandSummaries,
    prevBrandSummaries,
    creatorsNested,
    retainerMap,
    trendsByBrandRaw,
  ] = await Promise.all([
    getAnalyticsBrandSummaries(BRAND_IDS, startDate,     endDate).catch(() => []),
    getAnalyticsBrandSummaries(BRAND_IDS, prevStartDate, prevEndDate).catch(() => []),
    Promise.all(activeBrands.map(async (brand) => {
      try { return (await getCreatorRankings(brand, startDate, endDate, 50)).map((c) => ({ ...c, brand })); }
      catch { return []; }
    })),
    getCreatorRetainers(),
    Promise.all(activeBrands.map(b => getDailyTrend(b, startDate, endDate).catch(() => []))),
  ]);

  // ── Aggregate trend across active brands ────────────────────────────────
  // gmv-only series for the KPI sparkline, plus a full 4-metric series (summed
  // across brands) handed to the fold-in chart so the helper skips its own trend
  // fetch — the per-brand sum is verified identical to the aggregate RPC.
  const trendByDate = new Map<string, number>();
  const trendFullByDate = new Map<string, { report_date: string; daily_gmv: number; daily_orders: number; daily_items_sold: number; daily_videos: number }>();
  for (const brandTrend of trendsByBrandRaw) {
    for (const day of brandTrend) {
      trendByDate.set(day.report_date, (trendByDate.get(day.report_date) ?? 0) + day.daily_gmv);
      const e = trendFullByDate.get(day.report_date) ?? { report_date: day.report_date, daily_gmv: 0, daily_orders: 0, daily_items_sold: 0, daily_videos: 0 };
      e.daily_gmv += day.daily_gmv;
      e.daily_orders += day.daily_orders;
      e.daily_items_sold += day.daily_items_sold;
      e.daily_videos += day.daily_videos;
      trendFullByDate.set(day.report_date, e);
    }
  }
  const aggregatedTrend = Array.from(trendByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, gmv]) => ({ date, gmv }));
  const trendCurRows = Array.from(trendFullByDate.values());

  // ── Creator-side parallel fetch: managed-GMV-by-brand (for the
  //    BrandPerformance "Managed" column) and the grouped creator list
  //    (for highlights, alerts, top-creator). Both share an underlying
  //    handle→creator lookup; running them in parallel keeps it to the
  //    same wall-clock time as one query. ─────────────────────────────────
  const allCreators = creatorsNested.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0));
  // Managed GMV comes from the canonical computeManagedGmv() (src/lib/data/
  // managed-gmv.ts) — the SAME definition the Earnings + Creators pages use, so
  // all three tie out. `groupedCreators` still powers the creator table / alerts
  // (its own real-name grouping); it no longer drives the managed GMV totals,
  // which previously used a broader "any creators_v2 handle" definition over a
  // top-50-per-brand sample.
  const [mgPeriod, groupedCreators] = await Promise.all([
    computeManagedGmv(startDate, endDate, activeBrands, reg),
    aggregateCreatorsByRealName(allCreators, brandFilter),
  ]);
  const managedGmvByBrand = mgPeriod.byStore; // data-store slug → managed GMV

  // ── ROI numerator: managed GMV over a FIXED trailing-30-day window,
  //    independent of the page's date range (ROI is always trailing 30d).
  //    Folded-in Analytics (trend chart + movers + pacing) fetches in parallel.
  const roiEnd   = format(new Date(), 'yyyy-MM-dd');
  const roiStart = format(subDays(new Date(), 29), 'yyyy-MM-dd');
  const [mgRoi, foldIn] = await Promise.all([
    computeManagedGmv(roiStart, roiEnd, activeBrands, reg),
    getFoldInAnalytics({
      startDate, endDate, preset, brandFilter, allowedBrands, activeTenantId,
      prefetched: { brandIds: BRAND_IDS, bsCur: brandSummaries, bsPrev: prevBrandSummaries, trendCur: trendCurRows },
    }),
  ]);
  let managedGmv30 = 0;
  for (const [, g] of mgRoi.byStore) managedGmv30 += g;

  // ── Per-roster-brand stats — drives BrandPerformance card and the
  //    "Top Brand" mini-stat in the Period Brief. Aggregates across
  //    data slugs (e.g. leefar_nutrition + leefar_supplements → leefar). ──
  const rosterBrandStats: BrandRowData[] = activeRosterBrands.map((rosterSlug) => {
    const dataSlugSet = new Set(expandSlugs(reg, rosterSlug));
    let currentGmv = 0;
    let prevGmv    = 0;
    let managedGmvForBrand = 0;
    for (const s of brandSummaries)     if (dataSlugSet.has(s.brand_slug)) currentGmv += s.total_gmv;
    for (const s of prevBrandSummaries) if (dataSlugSet.has(s.brand_slug)) prevGmv    += s.total_gmv;
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

  // ── Managed GMV (portfolio-level) from the canonical shared calc. Unmanaged
  // is derived right after portfolio totals below (brand-wide minus managed).
  const managedGmv = Array.from(mgPeriod.byStore.values()).reduce((a, b) => a + b, 0);

  // ── Portfolio totals ────────────────────────────────────────────────────
  const totals = brandSummaries.reduce((acc, s) => {
    acc.gmv      += s.total_gmv;
    acc.orders   += s.total_orders;
    acc.items    += s.total_items_sold;
    acc.creators += s.unique_creators;
    acc.videos   += s.total_videos;
    return acc;
  }, { gmv: 0, orders: 0, items: 0, creators: 0, videos: 0 });
  // Unmanaged = brand-wide GMV not attributable to a managed creator. (Was a
  // per-creator isManaged sum over the top-50-per-brand sample.)
  // NOTE: cross-source subtraction — totals.gmv comes from the analytics
  // summaries (daily_creator_stats) while managedGmv comes from computeManagedGmv
  // (creator_performance). The two are kept in sync but can drift slightly, so
  // treat unmanaged / Managed Share % as approximate (managedGmv itself is exact).
  // Guarded with max(0, …) so drift can't render a negative.
  const unmanagedGmv = Math.max(0, totals.gmv - managedGmv);

  const prevTotals = prevBrandSummaries.reduce((acc, s) => {
    acc.gmv    += s.total_gmv;
    acc.orders += s.total_orders;
    return acc;
  }, { gmv: 0, orders: 0 });

  const gmvTrend    = pctChange(totals.gmv,    prevTotals.gmv);
  const ordersTrend = pctChange(totals.orders, prevTotals.orders);

  // ROI = managed GMV (trailing 30d) ÷ total monthly retainer — the agency's
  // return on what it pays its creators, always over a 30-day window.
  let totalRetainerSpend = 0;
  for (const [, info] of retainerMap) totalRetainerSpend += info.retainer ?? 0;
  const roi = totalRetainerSpend > 0 ? managedGmv30 / totalRetainerSpend : 0;
  const managedSharePct = totals.gmv > 0 ? (managedGmv / totals.gmv) * 100 : 0;

  // ── Creator alerts (feeds the Creator Alerts card) ─────
  const allAlerts = buildCreatorAlerts(groupedCreators);

  // ── Stale-data check ────────────────────────────────────────────────────
  const latestDate = aggregatedTrend.length > 0 ? aggregatedTrend[aggregatedTrend.length - 1].date : null;
  const daysStale  = latestDate ? Math.floor((Date.now() - new Date(latestDate).getTime()) / 86400000) : null;
  const isStale    = daysStale != null && daysStale > 3;

  // ── Header copy ─────────────────────────────────────────────────────────
  const activeBrandColor = brandFilter ? (reg.bySlug.get(brandFilter)?.color ?? null) : null;
  const activeBrandName  = brandFilter ? brandLabel(reg, brandFilter) : null;
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
      <PageHeader
        eyebrow={brandFilter ? activeBrandName : 'Portfolio'}
        title={headerLabel}
        subtitle={
          <div className="flex flex-col gap-1">
            <span>{headerSub}</span>
            <span className="inline-flex items-center gap-1 text-xs">
              <span className={cn('h-1.5 w-1.5 rounded-full', isStale ? 'bg-[var(--pulse-warn)]' : 'bg-[var(--pulse-pos)]')} />
              <span className="tabular-nums">{dataThroughLabel}</span>
            </span>
          </div>
        }
        actions={
          <Suspense fallback={null}>
            <DateRangePicker />
          </Suspense>
        }
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
          accentColor="var(--pulse-accent-2)"
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
          label="ROI · 30d"
          value={roi > 0 ? `${roi.toFixed(1)}x` : 'N/A'}
          accentColor={activeBrandColor ?? 'var(--primary)'}
          subValue={totalRetainerSpend > 0 ? `${formatCurrency(managedGmv30)} managed ÷ ${formatCurrency(totalRetainerSpend)}/mo` : undefined}
        />
      </div>

      {/* Month-to-date pacing — projects where GMV lands (in-progress periods
          only). Folded in from the retired Analytics page. */}
      {foldIn.pacing && (
        <PacingTile
          daysElapsed={foldIn.pacing.daysElapsed}
          periodLength={foldIn.pacing.periodLength}
          gmvToDate={foldIn.pacing.gmvToDate}
          periodLabel={foldIn.pacing.periodLabel}
        />
      )}

      {/* Empty-state for a brand-filtered view with no activity */}
      {isEmptyBrand && (
        <EmptyState
          icon={<BarChart3 className="h-8 w-8" />}
          title={`No data for ${activeBrandName} in this period`}
          description="Try a different date range, or check back once creators have activity in this period."
          action={
            <a href="?range=last7" className={buttonVariants({ variant: 'outline' })}>
              View Last 7 Days →
            </a>
          }
        />
      )}

      {/* Brand Performance — multi-brand-only. The agency operator's most
          important section: brand-by-brand GMV / trend / sparkline, with
          click-to-filter. Only renders for tenants with >1 brand on the
          unfiltered All Brands view. */}
      {!brandFilter && rosterBrandStats.length > 1 && (
        <BrandPerformance brands={rosterBrandStats} range={params.range} />
      )}

      {/* Performance over time — portfolio GMV/orders/videos with prior-period
          and year-over-year overlays. Folded in from the retired Analytics page. */}
      {!isEmptyBrand && (
        <PerformanceChart
          data={foldIn.trend.data}
          priorData={foldIn.trend.priorData}
          yoyData={foldIn.trend.yoyData}
          accentColor={foldIn.trend.accentColor}
        />
      )}

      {/* What's moving — auto-surfaced brand risers/fallers, breakout creator,
          hot post, top product (folded in from Analytics). */}
      {foldIn.notable.hasAny && (
        <NotableChanges
          brandRiser={foldIn.notable.brandRiser}
          brandFaller={foldIn.notable.brandFaller}
          creatorBreakout={foldIn.notable.creatorBreakout}
          hotPost={foldIn.notable.hotPost}
          topProduct={foldIn.notable.topProduct}
        />
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
