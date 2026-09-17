export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { BarChart3 } from 'lucide-react';
import { format, subDays, differenceInDays } from 'date-fns';

import { getAnalyticsBrandTotals, getAnalyticsLatestDataDate, getAnalyticsBrandDailySeries } from '@/lib/data/rpc';
import { resolveDateRange } from '@/lib/data/date-utils';
import { getDataAnchorDate } from '@/lib/data/data-anchor';
import { fetchHandleDisplayMeta } from '@/lib/data/creator-aggregate';
import { computeManagedGmv, buildManagedLookup } from '@/lib/data/managed-gmv';
import { formatCurrency, formatCurrencyExact } from '@/lib/utils/format';
import { pctChange } from '@/lib/utils/trend';
import { getBrandRegistry, brandLabel, expandSlugs } from '@/lib/data/brand-registry';
import { createClient } from '@/lib/supabase/server';
import { getActiveTenantId } from '@/lib/auth/platform-admin';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';

import { StatCard } from '@/components/dashboard/stat-card';
import { ManagedOrganicDonut } from '@/components/dashboard/managed-organic-donut';
import { DashboardCharts } from '@/components/dashboard/dashboard-charts';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { BrandFilter } from '@/components/creators/brand-filter';
import { dashboardComparison } from '@/lib/data/dashboard-comparison';
import { buildContributors } from '@/lib/data/dashboard-contributors';
import { GmvContributors } from '@/components/dashboard/gmv-contributors';
import { buildDashboardTrend } from '@/lib/data/dashboard-trend';
import { ManagerPortfolios } from '@/components/dashboard/manager-portfolios';
import { getDashboardManagers } from '@/lib/data/dashboard-managers';
import { buildDashboardSignals } from '@/lib/data/dashboard-signals';
import reviewStyles from '@/components/dashboard/morning-review.module.css';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { BrandPerformance, type BrandRowData } from '@/components/dashboard/brand-performance';
import { TopCreators } from '@/components/dashboard/top-creators';
import { TopVideos } from '@/components/dashboard/top-videos';
import { StaleDataBanner } from '@/components/dashboard/stale-data-banner';
import { DashboardOnboarding } from '@/components/dashboard/dashboard-onboarding';

interface Props {
  searchParams: Promise<{ range?: string; brand?: string; start?: string; end?: string }>;
}

type SB = Awaited<ReturnType<typeof createClient>>;

/**
 * Per-brand monthly retainer from managed_creators.retainer — the SAME source
 * /api/roster uses for Total Retainers, so the dashboard's ROI + Retainers tie
 * out to /roster (creator_brands.retainer is a different, incomplete field).
 * Paged past PostgREST's 1000-row cap, and deduped by (creator_id, brand) taking
 * MAX — matching /api/roster exactly, so re-add / merged-identity duplicate rows
 * don't double-count (which would inflate Retainers/mo and deflate ROI).
 */
async function fetchRetainerBySlug(supabase: SB): Promise<Map<string, number>> {
  const retainerBySlug = new Map<string, number>();
  const maxByCreatorBrand = new Map<string, { brand: string; retainer: number }>();
  for (let from = 0; ; from += 1000) {
    const { data: mcPage } = await supabase
      .from('managed_creators').select('creator_id, brand, retainer').is('archived_at', null)
      .order('id', { ascending: true }).range(from, from + 999);
    const rows = (mcPage as { creator_id: string | null; brand: string | null; retainer: number | null }[] | null) ?? [];
    for (const r of rows) {
      if (!r.brand) continue;
      const ret = Number(r.retainer) || 0;
      if (r.creator_id) {
        const k = `${r.creator_id}|${r.brand}`;
        const prev = maxByCreatorBrand.get(k);
        if (!prev || ret > prev.retainer) maxByCreatorBrand.set(k, { brand: r.brand, retainer: ret });
      } else {
        // Unlinked rows can't be deduped by creator — count each once.
        retainerBySlug.set(r.brand, (retainerBySlug.get(r.brand) ?? 0) + ret);
      }
    }
    if (rows.length < 1000) break;
  }
  for (const { brand, retainer } of maxByCreatorBrand.values()) {
    retainerBySlug.set(brand, (retainerBySlug.get(brand) ?? 0) + retainer);
  }
  return retainerBySlug;
}

export default async function AdminDashboard({ searchParams }: Props) {
  const params = await searchParams;
  // ── Tenant + brand context (parallel — these don't depend on each other) ──
  const supabase = await createClient();
  const [reg, activeTenantId, allowedBrands, scope] = await Promise.all([
    getBrandRegistry(),
    getActiveTenantId(),
    import('@/lib/data/brands').then((m) => m.getAllowedBrandsForUser()),
    getWorkspaceScope(),
  ]);
  // Finance: none for finance-blind scopes (e.g. coaches). Retainer dollars must
  // render as ABSENCE ("—"), never a fabricated $0 — so when this is false the
  // retainer fetch is skipped entirely and every retainer/ROI surface shows "—".
  // Retainer + ROI cards are creator COST (scoped to this user's own brands),
  // not the agency's books. Named for what it IS: a future genuine finance gate
  // in this file must not reach for `canViewFinance` and silently re-fuse the
  // two concerns. See workspace-scope.ts.
  const canViewCost = scope?.canViewCreatorCost ?? false;

  let brandsQuery = supabase.from('brands_v2').select('slug').eq('is_archived', false).order('name');
  if (activeTenantId) brandsQuery = brandsQuery.eq('tenant_id', activeTenantId);
  if (allowedBrands)  brandsQuery = brandsQuery.in('slug', allowedBrands);
  const { data: dbBrands } = await brandsQuery;
  const hiddenSlugs = new Set(reg.rows.filter(r => r.parent_brand_id != null).map(r => r.slug));
  const ALL_BRANDS = (dbBrands ?? []).map(b => b.slug).filter(s => !hiddenSlugs.has(s));

  // ── Empty-tenant onboarding ─────────────────────────────────────────────
  if (ALL_BRANDS.length === 0) {
    const { data: { user } } = await supabase.auth.getUser();
    let tenantData: { tiktok_connected: boolean; creators_added: boolean; discord_connected: boolean } | null = null;
    if (user) {
      const { data: profile } = await supabase.from('user_profiles').select('tenant_id').eq('user_id', user.id).maybeSingle();
      if (profile?.tenant_id) {
        const { data: t } = await supabase.from('tenants').select('tiktok_connected, creators_added, discord_connected').eq('id', profile.tenant_id).single();
        tenantData = t;
      }
    }
    return (
      <DashboardOnboarding
        tiktokConnected={tenantData?.tiktok_connected ?? false}
        creatorsAdded={tenantData?.creators_added ?? false}
        discordConnected={tenantData?.discord_connected ?? false}
      />
    );
  }

  // ── Resolve brand filter + expand to data slugs ─────────────────────────
  const brandFilter = params.brand && ALL_BRANDS.includes(params.brand) ? params.brand : null;
  const activeRosterBrands = brandFilter ? [brandFilter] : ALL_BRANDS;
  const managersPromise = !brandFilter ? getDashboardManagers(activeRosterBrands) : Promise.resolve(undefined);
  const activeBrands = activeRosterBrands.flatMap(b => expandSlugs(reg, b));
  // brand_ids for the multi-brand analytics_* RPCs (shared with the fold-in helper).
  // Resolve via the registry (has every brand's id) rather than the allowedBrands-
  // scoped brands_v2 read above, so umbrella-scoped managers still resolve their
  // child stores. activeBrands is already tenant/allowed-scoped, so this stays safe.
  const BRAND_IDS = activeBrands.map(s => reg.bySlug.get(s)?.id).filter((id): id is string => Boolean(id));

  // start/end are REQUIRED for range=custom — resolveDateRange falls back to
  // last7 without them ('custom' isn't in DATE_PRESETS), which silently ignored
  // the user's custom range.
  // Rolling presets end at the last day with data, not calendar yesterday.
  // Scoped to what this page is showing, never per brand inside a total.
  // See the note on resolveDateRange.
  // ⚠️ Resolved HERE rather than at the top of the function because the anchor
  // needs activeBrands. Nothing above reads startDate/endDate.
  const dataThrough = await getDataAnchorDate(activeBrands);
  const { startDate, endDate, lagDays, anchorDate } =
    resolveDateRange(params.range, params.start, params.end, dataThrough);
  // Non-null only when the window actually moved; see DateRangePicker.
  const staleThrough = lagDays > 0 ? anchorDate : null;

  // ⚠️ The per-brand stale-data banner used to sit here, with a
  //    brand_data_freshness RPC feeding it. Removed at the Director's request:
  //    it fired on every load and had become wallpaper. Data freshness is still
  //    surfaced where it is actionable — the Data Pipeline page's coverage
  //    ledger and the reporting table's per-row coverage — which is the place
  //    you go to actually fix it. The RPC and StaleBrandsBanner remain, unused
  //    by this page, if it should ever come back.

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
  // ── ROI numerator window: managed GMV over a FIXED trailing-30-day window,
  //    independent of the page's date range (ROI is always trailing 30d).
  const roiEnd   = format(new Date(), 'yyyy-MM-dd');
  const roiStart = format(subDays(new Date(), 29), 'yyyy-MM-dd');

  // Which handles are managed on which store — date-INDEPENDENT, so build it
  // ONCE and hand it to all three computeManagedGmv windows below (period /
  // trailing-30d ROI / prior period). Each call used to rebuild it identically:
  // brands_v2 + ~1,460 paged managed_creators rows + a 5-batch tiktok_accounts
  // loop over ~950 ids, three times over.
  //
  // Deliberately NOT React cache(): it keys on Object.is per argument, and
  // `activeBrands` is a fresh array here, so every caller would miss.
  const managedLookup = await buildManagedLookup(activeBrands, reg);

  // EVERYTHING that doesn't depend on another fetch goes in ONE wave. This was
  // five sequential round-trips (summaries → mgPeriod → mgRoi/mgPrev → retainer
  // → posts); each computeManagedGmv alone fans out ~1 RPC per store, so the
  // serial waves dominated load time. Only groupedCreators (needs the creator
  // rankings) and the daily series (needs mgPeriod's handle set) must follow.
  const [
    brandSummaries,
    prevBrandSummaries,
    latestDate,
    brandDaily,
    mgPeriod,
    mgRoi,
    mgPrev,
    retainerBySlug,
    topPostsRes,
  ] = await Promise.all([
    // `null` (not []) on failure so the KPIs can render "—" instead of a
    // confident $0 — a swallowed statement_timeout here is exactly what made
    // Total GMV read $0 for every user.
    getAnalyticsBrandTotals(BRAND_IDS, startDate, endDate).catch((e) => {
      console.error('[dashboard] analytics_brand_totals (current period) failed:', e);
      return null;
    }),
    getAnalyticsBrandTotals(BRAND_IDS, prevStartDate, prevEndDate).catch((e) => {
      console.error('[dashboard] analytics_brand_totals (previous period) failed:', e);
      return null;
    }),
    // ONE call for the "Data through" date + stale check. This was 28 RPCs
    // (get_daily_trend per brand), whose whole day-by-day output was summed in
    // JS only to read the last date off the end. Deliberately not caught to []:
    // one RPC is now a single point of failure where 27 of 28 could previously
    // still yield a date, and "no data in range" must stay distinguishable from
    // "the query died" (null → "—", not a fake "Awaiting first data sync").
    getAnalyticsLatestDataDate(activeBrands, startDate, endDate).catch((e) => {
      console.error('[dashboard] analytics_latest_data_date failed:', e);
      return undefined; // undefined = failed; null = genuinely no data
    }),
    // Daily rows span current + prior periods for recorded-day checks. A failure
    // suppresses signals and chart lines; it must not imply zero activity.
    getAnalyticsBrandDailySeries(BRAND_IDS, prevStartDate, endDate).catch((e) => {
      console.error('[dashboard] analytics_brand_daily_series failed; signals and sparklines omitted:', e);
      return null;
    }),
    computeManagedGmv(startDate, endDate, activeBrands, reg, managedLookup),
    computeManagedGmv(roiStart, roiEnd, activeBrands, reg, managedLookup),
    computeManagedGmv(prevStartDate, prevEndDate, activeBrands, reg, managedLookup),
    // Finance-blind viewers never fetch retainers — an empty map keeps the math
    // below inert; the retainer/ROI cards + columns render "—" via canViewCost.
    canViewCost ? fetchRetainerBySlug(supabase) : Promise.resolve(new Map<string, number>()),
    activeBrands.length === 0
      ? Promise.resolve({ data: [] as Record<string, unknown>[] })
      : supabase.rpc('get_top_videos_by_window_gmv', {
          p_brand_slugs: activeBrands, p_start_date: startDate, p_end_date: endDate, p_limit: 10,
        }),
  ]);

  // A failed totals fetch must not read as "$0 of GMV" — track it and render "—".
  const totalsFailed = brandSummaries === null;
  const summaryRows = brandSummaries ?? [];
  const prevSummaryRows = prevBrandSummaries ?? [];

  // ── Creator-side parallel fetch: managed-GMV-by-brand (for the
  //    BrandPerformance "Managed" column) and the grouped creator list
  //    (for highlights, alerts, top-creator). Both share an underlying
  //    handle→creator lookup; running them in parallel keeps it to the
  //    same wall-clock time as one query. ─────────────────────────────────
  // Managed GMV comes from the canonical computeManagedGmv() (src/lib/data/
  // managed-gmv.ts) — the SAME definition the Earnings + Creators pages use, so
  // all three tie out.
  const managedGmvByBrand = mgPeriod.byStore; // data-store slug → managed GMV

  let managedGmv30 = 0;
  for (const [, g] of mgRoi.byStore) managedGmv30 += g;
  let prevManagedGmv = 0;
  for (const [, g] of mgPrev.byStore) prevManagedGmv += g;

  // ── Managed-GMV daily series (chart) — the one fetch that must follow the
  //    first wave: it needs mgPeriod's exact managed handle set. Runs alongside
  //    the handle→name lookup, which needs the same set.
  const managedHandles = Array.from(
    new Set([mgPeriod, mgPrev].flatMap(period => Array.from(period.byStoreCreator.values()).flatMap(m => Array.from(m.keys())))),
  );
  const handleMeta = await fetchHandleDisplayMeta(managedHandles).catch((error) => {
    console.error('[dashboard] fetchHandleDisplayMeta failed:', error);
    return new Map<string, { name: string; id: string }>();
  });

  // ── Top Videos — top-10 managed videos by GMV EARNED in the selected window
  //    (get_top_videos_by_window_gmv, migration 079). GMV is SUM(video_performance)
  //    over report_date — the same basis as the creator card — not the frozen
  //    last-upload snapshot on videos.total_gmv the card used to read (which left
  //    97% of its own rows at $0 and hid evergreen earners posted before the
  //    window). Views (migration 088): windowed from the daily engagement columns
  //    the Video Data upload now ingests — NULL until a day's file has been
  //    (re)uploaded post-088, so the card shows views only when real.
  //
  // CHECK .error, not just .data. supabase.rpc() resolves {data, error}; on
  // failure data is null, and `?? []` turned that into "No managed videos in
  // this period" — a confident empty state over a dead query. That is exactly
  // what happened before: the RPC blew the statement_timeout and the card claimed
  // you had no videos. The RPC being fast now is not the fix — reading the error is.
  const topPostsErr = (topPostsRes as { error?: { message?: string } | null }).error;
  if (topPostsErr) console.error('[dashboard] get_top_videos_by_window_gmv failed:', topPostsErr.message);
  const topVideosFailed = !!topPostsErr;
  const topVideos = (((topPostsRes as { data: Record<string, unknown>[] | null }).data) ?? [])
    .map((p) => ({
      title: String(p.video_title ?? ''),
      url: String(p.video_url ?? ''),
      handle: String(p.creator_handle ?? ''),
      brand: String(p.brand_name ?? ''),
      gmv: Number(p.gmv) || 0,
      views: p.views == null ? null : Number(p.views),
    }))
    .filter((v) => v.gmv > 0)
    .slice(0, 10);

  // ── Top Creators — top-10 managed creators by MANAGED GMV this period. Ranked
  //    from the canonical computeManagedGmv (strict-managed, ties to the Managed
  //    GMV hero), aggregated per-person; real names + detail-page ids from
  //    handleMeta, falling back to the handle. ─────────────────────────────────
  // Merge-then-slice, NOT rank-then-slice: handleMeta supplies the aggregation
  // KEY below, so one person's several handles must combine BEFORE the top-10
  // cut or they'd occupy multiple rows with split GMV.
  const creatorAgg = new Map<string, { name: string | null; id?: string; handle: string; gmv: number }>();
  for (const perStore of mgPeriod.byStoreCreator.values()) {
    for (const cg of perStore.values()) {
      const meta = handleMeta.get(cg.handleNorm);
      const name = meta?.name ?? null;
      const key = meta?.id ?? cg.handleNorm;
      const e = creatorAgg.get(key) ?? { name, id: meta?.id, handle: cg.rawName || cg.handleNorm, gmv: 0 };
      e.gmv += cg.gmv;
      creatorAgg.set(key, e);
    }
  }
  const topCreators = Array.from(creatorAgg.values())
    .filter((c) => c.gmv > 0)
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, 10);

  // ── Per-roster-brand stats — drives BrandPerformance card and the
  //    "Top Brand" mini-stat in the Period Brief. Aggregates across
  //    data slugs (e.g. leefar_nutrition + leefar_supplements → leefar). ──
  // Daily GMV per DATA slug, for the row sparklines. The RPC returns brand_id;
  // fold it to slug here so umbrella roster brands can sum their stores per day.
  const dailyBySlug = new Map<string, Map<string, number>>();
  for (const p of brandDaily ?? []) {
    const slug = reg.byId.get(p.brand_id)?.slug;
    if (!slug) continue;
    const m = dailyBySlug.get(slug) ?? new Map<string, number>();
    m.set(p.report_date, (m.get(p.report_date) ?? 0) + p.gmv);
    dailyBySlug.set(slug, m);
  }
  // Every day in the range, in order — the sparkline plots by index, so a brand
  // missing a day (cosrx has 6 of 7 today) must read as a zero, not close the gap
  // and imply continuity that isn't there.
  const rangeDays: string[] = [];
  for (let d = new Date(`${startDate}T00:00:00Z`); d <= new Date(`${endDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    rangeDays.push(d.toISOString().slice(0, 10));
  }

  const rosterBrandStats: BrandRowData[] = activeRosterBrands.map((rosterSlug) => {
    const dataSlugSet = new Set(expandSlugs(reg, rosterSlug));
    let currentGmv = 0;
    let prevGmv    = 0;
    let managedGmvForBrand = 0;
    let prevManagedForBrand = 0;
    for (const s of summaryRows)     if (dataSlugSet.has(s.brand_slug)) currentGmv += s.total_gmv;
    for (const s of prevSummaryRows) if (dataSlugSet.has(s.brand_slug)) prevGmv    += s.total_gmv;
    for (const ds of dataSlugSet)  managedGmvForBrand  += managedGmvByBrand.get(ds) ?? 0;
    // Prior-period managed GMV was already fetched for the portfolio KPI — it
    // just wasn't read per brand. Same canonical computeManagedGmv source, so
    // the row's managed trend ties to the Managed GMV hero's.
    for (const ds of dataSlugSet)  prevManagedForBrand += mgPrev.byStore.get(ds) ?? 0;

    // Per-brand ROI: trailing-30d managed GMV ÷ this brand's monthly retainer
    // (same basis as the portfolio ROI card).
    let managed30ForBrand = 0;
    for (const ds of dataSlugSet) managed30ForBrand += mgRoi.byStore.get(ds) ?? 0;
    let brandRetainer = 0;
    for (const s of new Set<string>([rosterSlug, ...dataSlugSet])) brandRetainer += retainerBySlug.get(s) ?? 0;
    const brandRoi = brandRetainer > 0 ? managed30ForBrand / brandRetainer : undefined;

    // Sum the brand's stores per day, then read the range in order.
    const perDay = new Map<string, number>();
    for (const ds of dataSlugSet) {
      for (const [day, v] of dailyBySlug.get(ds) ?? []) perDay.set(day, (perDay.get(day) ?? 0) + v);
    }
    const series = rangeDays.map((d) => perDay.get(d) ?? 0);

    return {
      slug: rosterSlug,
      currentGmv,
      managedGmv: managedGmvForBrand,
      prevGmv,
      prevManagedGmv: prevManagedForBrand,
      trend: brandSummaries === null || prevBrandSummaries === null ? undefined : pctChange(currentGmv, prevGmv),
      managedTrend: pctChange(managedGmvForBrand, prevManagedForBrand),
      // Finance-blind: null/undefined (absence → "—" in the table), never 0.
      retainer: canViewCost ? brandRetainer : null,
      roi: canViewCost ? brandRoi : undefined,
      series,
      days: rangeDays,
    };
  });

  // The morning review derives signals only from these already-authorized rows.

  // ── Managed GMV (portfolio-level) from the canonical shared calc. Unmanaged
  // is derived right after portfolio totals below (brand-wide minus managed).
  const managedGmv = Array.from(mgPeriod.byStore.values()).reduce((a, b) => a + b, 0);

  // ── Portfolio totals ────────────────────────────────────────────────────
  const totals = summaryRows.reduce((acc, s) => {
    acc.gmv    += s.total_gmv;
    acc.orders += s.total_orders;
    acc.units += s.total_items_sold;
    return acc;
  }, { gmv: 0, orders: 0, units: 0 });
  // Unmanaged = brand-wide GMV not attributable to a managed creator. (Was a
  // per-creator isManaged sum over the top-50-per-brand sample.)
  // NOTE: cross-source subtraction — totals.gmv comes from the analytics
  // summaries (daily_creator_stats) while managedGmv comes from computeManagedGmv
  // (creator_performance). The two are kept in sync but can drift slightly, so
  // treat unmanaged / Managed Share % as approximate (managedGmv itself is exact).
  // Guarded with max(0, …) so drift can't render a negative.
  const unmanagedGmv = Math.max(0, totals.gmv - managedGmv);

  const prevTotals = prevSummaryRows.reduce((acc, s) => {
    acc.gmv    += s.total_gmv;
    acc.orders += s.total_orders;
    acc.units += s.total_items_sold;
    return acc;
  }, { gmv: 0, orders: 0, units: 0 });





  // ROI = managed GMV (trailing 30d) ÷ total monthly retainer — the agency's
  // return on what it pays its creators, always over a 30-day window.
  let totalRetainerSpend = 0;
  for (const rosterSlug of activeRosterBrands) {
    for (const s of new Set<string>([rosterSlug, ...expandSlugs(reg, rosterSlug)])) {
      totalRetainerSpend += retainerBySlug.get(s) ?? 0;
    }
  }
  const roi = totalRetainerSpend > 0 ? managedGmv30 / totalRetainerSpend : 0;
  const retainerBrandCount = activeRosterBrands.filter((rs) =>
    [rs, ...expandSlugs(reg, rs)].some((s) => (retainerBySlug.get(s) ?? 0) > 0),
  ).length;



  // ── Stale-data check ────────────────────────────────────────────────────
  // This warns that the DATA PIPELINE is behind — NOT that you're deliberately
  // viewing a past period. latestDate is the last point *within the selected
  // range*, so a historical custom range (e.g. June) always ends in the past and
  // would otherwise be flagged "16 days old", falsely implying Tempo is out of
  // date. Only evaluate staleness when the range actually reaches the present
  // (presets end at yesterday, so they always do).
  // latestDate: a date = real data; null = genuinely no data in range;
  // undefined = the lookup FAILED (don't claim either — see dataThroughLabel).
  const dateFailed = latestDate === undefined;
  const rangeReachesToday = differenceInDays(new Date(), new Date(endDate)) <= 3;
  const daysStale  = latestDate ? Math.floor((Date.now() - new Date(latestDate).getTime()) / 86400000) : null;
  const isStale    = rangeReachesToday && daysStale != null && daysStale > 3;

  // ── Header copy ─────────────────────────────────────────────────────────
  const activeBrandName  = brandFilter ? brandLabel(reg, brandFilter) : null;
  const dataThroughLabel = latestDate
    ? `Data through ${format(new Date(latestDate), 'MMM d, yyyy')}`
    // Never assert "Awaiting first data sync" over a failed lookup — that's a
    // fabricated empty state on a freshness claim the user acts on.
    : dateFailed
      ? 'Data freshness unavailable'
      : 'No recorded data in this period';

  // "No data for this brand" is only true if the fetch actually SUCCEEDED and
  // came back empty — otherwise it's a fetch failure wearing an empty state.
  const isEmptyBrand = !totalsFailed && brandFilter && totals.gmv === 0 && totals.orders === 0;
  // Include inactive brands so a genuine decline to zero remains visible.
  const activeBrandRows = rosterBrandStats;
  const showBrandPerf = !totalsFailed && !brandFilter && activeBrandRows.length > 1;

  const comparisonDays: string[] = [];
  for (let d = new Date(`${prevStartDate}T00:00:00Z`); d <= new Date(`${prevEndDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) comparisonDays.push(d.toISOString().slice(0,10));
  const signals = buildDashboardSignals(rosterBrandStats.map(row => {
    const stores = expandSlugs(reg, row.slug);
    return { ...row,
      recordedDays: rangeDays.filter(day => stores.every(slug => dailyBySlug.get(slug)?.has(day))).length,
      previousRecordedDays: comparisonDays.filter(day => stores.every(slug => dailyBySlug.get(slug)?.has(day))).length,
    };
  }), periodLength, brandSummaries !== null && prevBrandSummaries !== null && brandDaily !== null);
  const comparableBrands = signals.available ? activeRosterBrands.filter(slug => !signals.attention.some(row => row.slug === slug && row.kind === 'coverage')) : [];
  const comparableStores = new Set(comparableBrands.flatMap(slug => expandSlugs(reg,slug)));
  const contributorRows = buildContributors(
    Array.from(mgPeriod.byStoreCreator.entries()).filter(([store]) => comparableStores.has(store)).flatMap(([,rows]) => Array.from(rows.values()).map(row => ({handle:row.handleNorm,gmv:row.gmv}))),
    Array.from(mgPrev.byStoreCreator.entries()).filter(([store]) => comparableStores.has(store)).flatMap(([,rows]) => Array.from(rows.values()).map(row => ({handle:row.handleNorm,gmv:row.gmv}))), handleMeta);
  const comparisonRecorded = signals.available && !signals.attention.some(row => row.kind === 'coverage');
  const comparison = dashboardComparison(comparableStores, summaryRows, prevSummaryRows, mgPeriod.byStore, mgPrev.byStore);
  const canCompare = comparableBrands.length > 0;
  const comparisonLabel = canCompare
    ? 'vs prior period'
    : signals.available ? 'No comparable brands in this period' : 'Comparison temporarily unavailable';
  function comparisonDelta(metric: 'gmv' | 'managed' | 'orders' | 'units') {
    if (!canCompare) return comparisonLabel;
    const delta = comparison.current[metric] - comparison.previous[metric];
    const value = metric === 'gmv' || metric === 'managed' ? formatCurrency(Math.abs(delta)) : Math.abs(delta).toLocaleString('en-US');
    return `${delta >= 0 ? '+' : '−'}${value} ${comparisonLabel}`;
  }

  const totalDaily = buildDashboardTrend(rangeDays, activeBrands, dailyBySlug).map(point => ({ ...point,
    recordedBrands: activeRosterBrands.filter(brand => expandSlugs(reg, brand).every(slug => dailyBySlug.get(slug)?.has(point.date))).length,
  }));


  const incompleteBrands = activeRosterBrands.filter(brand => rangeDays.some(day => expandSlugs(reg, brand).some(slug => !dailyBySlug.get(slug)?.has(day))));
  const managers = await managersPromise;

  return (
    <div className={`${reviewStyles.page} space-y-6`}>
      {/* Stale-data warning — shows when the freshest data point is >3 days old */}
      {isStale && latestDate && daysStale != null && (
        <StaleDataBanner latestDate={latestDate} daysStale={daysStale} />
      )}

      {/* Header */}
      <PageHeader
        eyebrow={brandFilter ? activeBrandName ?? "Dashboard" : "Agency overview"}
        title="Dashboard"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <BrandFilter compact label="Dashboard brand scope" appearance="creator" brands={ALL_BRANDS} brandsWithData={activeBrandRows.map(row => row.slug)} selectedBrand={brandFilter} />
            <Suspense fallback={null}>
              <DateRangePicker staleThrough={staleThrough} />
            </Suspense>
            {/* "Data through" live status chip — mirrors the mockup's tinted
                `.chip.live`; green when fresh, amber when the data is stale. */}
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-[11px] text-muted-foreground',
                isStale
                  ? 'border-[var(--pulse-warn)]/30 bg-[var(--pulse-warn)]/10'
                  : 'border-[var(--pulse-pos)]/25 bg-[var(--pulse-pos)]/10',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', isStale ? 'bg-[var(--pulse-warn)]' : 'bg-[var(--pulse-pos)]')} />
              <span className="tabular-nums">{dataThroughLabel}</span><InfoTooltip label={`Changes compare ${comparableBrands.length} fully recorded brands in both periods. Headline totals include all recorded sales. ${incompleteBrands.map(slug => brandLabel(reg,slug)).join(', ')}${incompleteBrands.length ? ': missing daily data; excluded from comparisons.' : ''}`} />
            </span>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{format(new Date(`${startDate}T12:00:00`), 'MMM d, yyyy')} – {format(new Date(`${endDate}T12:00:00`), 'MMM d, yyyy')}</span>
        <span>vs {format(new Date(`${prevStartDate}T12:00:00`), 'MMM d, yyyy')} – {format(new Date(`${prevEndDate}T12:00:00`), 'MMM d, yyyy')}</span>
        <span>{brandFilter ? activeBrandName : `${ALL_BRANDS.length} authorized brands`}</span>
      </div>

      <div className={reviewStyles.metrics}>
        <StatCard
          label="Total GMV"
          value={totalsFailed ? '—' : formatCurrency(totals.gmv)}
          trend={canCompare ? pctChange(comparison.current.gmv, comparison.previous.gmv) : undefined}
          trendLabel={comparisonDelta('gmv')}
          info="Total affiliate GMV across all brands in the selected period. The trend compares it to the previous period of equal length."
        />
        <StatCard
          label="Managed GMV"
          value={formatCurrency(managedGmv)}
          trend={canCompare ? pctChange(comparison.current.managed, comparison.previous.managed) : undefined}
          trendLabel={comparisonDelta('managed')}
          info="GMV driven by your managed creators in the selected period. The trend compares it to the previous period of equal length."
        />
        <StatCard label="Total orders" value={totalsFailed ? '—' : totals.orders.toLocaleString('en-US')}
          trend={canCompare ? pctChange(comparison.current.orders,comparison.previous.orders) : undefined}
          trendLabel={comparisonDelta('orders')}
          info="Affiliate orders reported for the selected brands and dates. An order can contain more than one unit. This is not all shop orders or a unique customer count." />
        <StatCard label="Units sold" value={totalsFailed ? '—' : totals.units.toLocaleString('en-US')}
          trend={canCompare ? pctChange(comparison.current.units,comparison.previous.units) : undefined}
          trendLabel={comparisonDelta('units')}
          info="Affiliate items sold from the same daily reports as GMV and orders, for the selected brands and dates. Units and orders are separate measures." />
        <StatCard label="Average order value" value={!totalsFailed && totals.orders > 0 ? formatCurrencyExact(totals.gmv / totals.orders) : '—'}
          trend={canCompare && comparison.current.orders > 0 && comparison.previous.orders > 0 ? pctChange(comparison.current.gmv / comparison.current.orders, comparison.previous.gmv / comparison.previous.orders) : undefined}
          trendLabel={comparisonLabel} info="Affiliate GMV divided by affiliate orders. The comparison uses the same fully recorded brands in both periods; this is a weighted average, not an average of brand averages." />
      </div>
      {canViewCost && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card><CardContent className="flex items-center justify-between gap-4 py-4"><div><p className="text-xs font-medium text-muted-foreground">Monthly retainer budget <InfoTooltip label="Current monthly creator commitments for the selected brands; not historical payments or spend in the selected date range."/></p><p className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(totalRetainerSpend)}</p></div><span className="text-xs text-muted-foreground">{retainerBrandCount} {retainerBrandCount===1?'brand':'brands'}</span></CardContent></Card>
        <Card><CardContent className="flex items-center justify-between gap-4 py-4"><div><p className="text-xs font-medium text-muted-foreground">GMV / retainer return <InfoTooltip label={`Managed GMV from ${roiStart} through ${roiEnd}, divided by current monthly commitments. Revenue multiple, not profit ROI; excludes commissions and other costs.`}/></p><p className="mt-1 text-xl font-semibold tabular-nums">{roi > 0 ? `${roi.toFixed(1)}×` : '—'}</p></div><span className="text-xs text-muted-foreground">Trailing 30 days</span></CardContent></Card>
      </div>}

      {/* Empty-state for a brand-filtered view with no activity */}
      {isEmptyBrand && (
        <EmptyState
          icon={<BarChart3 className="h-8 w-8" />}
          title={`No data for ${activeBrandName} in this period`}
          description="Try a different date range, or check recorded-day coverage before treating this as zero activity."
          action={
            <a href={`?range=last7${brandFilter ? `&brand=${encodeURIComponent(brandFilter)}` : ''}`} className={buttonVariants({ variant: 'outline' })}>
              View Last 7 Days →
            </a>
          }
        />
      )}

      {!isEmptyBrand && <DashboardCharts key={`${brandFilter}|${startDate}|${endDate}`} start={startDate} end={endDate} brand={brandFilter} initial={totalDaily} share={<Card><CardHeader><CardTitle>Managed share</CardTitle></CardHeader><CardContent>
        {totalsFailed ? <p className="py-10 text-sm text-muted-foreground">Split unavailable.</p> : <ManagedOrganicDonut managed={managedGmv} organic={unmanagedGmv} prevManaged={comparisonRecorded ? prevManagedGmv : undefined} prevTotal={comparisonRecorded ? prevTotals.gmv : undefined}/>}
      </CardContent></Card>}/>}

      {managers !== undefined && <ManagerPortfolios managers={managers} brands={activeBrandRows} labels={Object.fromEntries(activeRosterBrands.map(slug => [slug, brandLabel(reg, slug)]))} signals={signals} start={startDate} end={endDate} totalsAvailable={!totalsFailed} />}

      {/* Row 3 — Brand Performance, full width. Deliberately shows EVERY brand,
          including those with $0 managed GMV: a brand you have no managed
          creators on is a coverage gap worth seeing, not noise to hide. */}
      {!isEmptyBrand && showBrandPerf && (
        <BrandPerformance brands={activeBrandRows.map(row => !signals.available || signals.attention.some(signal => signal.slug === row.slug && signal.kind === 'coverage') ? { ...row, trend: undefined, managedTrend: undefined, series: undefined } : row)} range={params.range} start={params.start} end={params.end} periodLength={periodLength} />
      )}

      <GmvContributors rows={contributorRows} available={comparableBrands.length > 0} brand={brandFilter} start={startDate} end={endDate} coverage={`${comparableBrands.length} of ${activeRosterBrands.length} ${activeRosterBrands.length === 1 ? 'brand' : 'brands'} with comparable coverage`} />

      {/* Row 4 — Top Creators + Top Videos leaderboards (managed, by GMV) */}
      {!isEmptyBrand && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TopCreators brand={brandFilter} creators={topCreators} label={`${periodLength}d`} />
          <TopVideos brand={brandFilter} videos={topVideos} label={`${periodLength}d`} failed={topVideosFailed} />
        </div>
      )}
    </div>
  );
}
