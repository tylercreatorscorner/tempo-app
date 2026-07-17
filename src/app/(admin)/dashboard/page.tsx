export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { BarChart3 } from 'lucide-react';
import { format, subDays, differenceInDays } from 'date-fns';

import { getAnalyticsBrandTotals, getAnalyticsLatestDataDate } from '@/lib/data/rpc';
import { resolveDateRange } from '@/lib/data/date-utils';
import { fetchHandleDisplayMeta } from '@/lib/data/creator-aggregate';
import { computeManagedGmv, buildManagedLookup } from '@/lib/data/managed-gmv';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { pctChange } from '@/lib/utils/trend';
import { getBrandRegistry, brandLabel, expandSlugs } from '@/lib/data/brand-registry';
import { createClient } from '@/lib/supabase/server';
import { getActiveTenantId } from '@/lib/auth/platform-admin';

import { StatCard } from '@/components/dashboard/stat-card';
import { Greeting } from '@/components/dashboard/greeting';
import { ManagedOrganicDonut } from '@/components/dashboard/managed-organic-donut';
import { ManagedGmvChart } from '@/components/dashboard/managed-gmv-chart';
import { RosterHealthSection, RosterHealthSkeleton } from '@/components/dashboard/roster-health-section';
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

/** Viewer's name for the greeting (user_profiles.name, then auth metadata). */
async function fetchViewerName(supabase: SB): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profRaw } = await supabase
    .from('user_profiles').select('name').eq('user_id', user.id).maybeSingle();
  return (profRaw as { name?: string | null } | null)?.name
    ?? (user.user_metadata?.full_name as string | undefined)
    ?? null;
}

export default async function AdminDashboard({ searchParams }: Props) {
  const params = await searchParams;
  // start/end are REQUIRED for range=custom — resolveDateRange falls back to
  // last7 without them ('custom' isn't in DATE_PRESETS), which silently ignored
  // the user's custom range.
  const { startDate, endDate, preset } = resolveDateRange(params.range, params.start, params.end);

  // ── Tenant + brand context (parallel — these don't depend on each other) ──
  const supabase = await createClient();
  const [reg, activeTenantId, allowedBrands] = await Promise.all([
    getBrandRegistry(),
    getActiveTenantId(),
    import('@/lib/data/brands').then((m) => m.getAllowedBrandsForUser()),
  ]);

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
    mgPeriod,
    mgRoi,
    mgPrev,
    retainerBySlug,
    topPostsRes,
    userName,
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
    computeManagedGmv(startDate, endDate, activeBrands, reg, managedLookup),
    computeManagedGmv(roiStart, roiEnd, activeBrands, reg, managedLookup),
    computeManagedGmv(prevStartDate, prevEndDate, activeBrands, reg, managedLookup),
    fetchRetainerBySlug(supabase),
    activeBrands.length === 0
      ? Promise.resolve({ data: [] as Record<string, unknown>[] })
      : supabase.rpc('get_managed_posts', {
          p_brand_slugs: activeBrands, p_start_date: startDate, p_end_date: endDate, p_managed_only: true, p_limit: 10,
        }),
    fetchViewerName(supabase),
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
    new Set(Array.from(mgPeriod.byStoreCreator.values()).flatMap((m) => Array.from(m.keys()))),
  );
  const HCHUNK = 400;
  const handleChunks: string[][] = [];
  for (let i = 0; i < managedHandles.length; i += HCHUNK) handleChunks.push(managedHandles.slice(i, i + HCHUNK));
  // Roster Health is Suspense-streamed (its own async section) so the heavy
  // internal /api/roster call never blocks this render — see Row 3 below.
  const [seriesChunks, handleMeta] = await Promise.all([
    BRAND_IDS.length === 0 ? Promise.resolve([]) : Promise.all(handleChunks.map((slice) =>
      supabase.rpc('get_creator_handle_gmv_series', {
        handles: slice, brand_ids: BRAND_IDS, days_back: periodLength, p_start_date: startDate, p_end_date: endDate,
      }))),
    // Display names for exactly the handles we already have. Was 28 blocking
    // get_creator_rankings (50 rows each) + 2 more queries inside
    // aggregateCreatorsByRealName, ~99% of it discarded, to label ten rows.
    fetchHandleDisplayMeta(managedHandles).catch((e) => {
      // Degrade to raw handles rather than failing the page — but say so.
      console.error('[dashboard] fetchHandleDisplayMeta failed; Top Creators will show raw handles:', e);
      return new Map<string, { name: string; id: string }>();
    }),
  ]);
  const managedByDay = new Map<string, number>();
  for (const res of seriesChunks) {
    for (const s of ((res as { data: { stat_date: string; gmv: string | number }[] | null }).data) ?? []) {
      const day = String(s.stat_date).slice(0, 10);
      managedByDay.set(day, (managedByDay.get(day) ?? 0) + (Number(s.gmv) || 0));
    }
  }
  // Zero-fill every day in the range: the chart positions points by index, so
  // dropping zero-GMV days would collapse multi-day gaps and distort the timeline.
  const managedDaily: { date: string; gmv: number }[] = [];
  const seriesEnd = new Date(`${endDate}T00:00:00Z`);
  for (let d = new Date(`${startDate}T00:00:00Z`); d <= seriesEnd; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    managedDaily.push({ date: day, gmv: managedByDay.get(day) ?? 0 });
  }
  // NOTE: managedDaily comes from roster_creator_daily and over-attributes vs the
  // canonical computeManagedGmv hero (a handle's GMV on non-managed brands is
  // included). The chart shows only the trend SHAPE + delta (no headline total),
  // so no divergent managed number is displayed — pending managed-GMV source
  // unification (a strict-managed daily series).

  // ── Top Videos — top-10 managed posts by GMV (real videos.video_id, dedup'd
  //    + correctly attributed by get_managed_posts). No thumbnail field exists,
  //    so the card renders a play tile + links the TikTok URL. ───────────────
  const topVideos = (((topPostsRes as { data: Record<string, unknown>[] | null }).data) ?? [])
    .map((p) => ({
      title: String(p.video_title ?? ''),
      url: String(p.video_url ?? ''),
      handle: String(p.creator_handle ?? ''),
      brand: String(p.brand_name ?? ''),
      gmv: Number(p.gmv) || 0,
      views: Number(p.views) || 0,
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
      const key = meta?.id ?? name ?? cg.handleNorm;
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
  const rosterBrandStats: BrandRowData[] = activeRosterBrands.map((rosterSlug) => {
    const dataSlugSet = new Set(expandSlugs(reg, rosterSlug));
    let currentGmv = 0;
    let prevGmv    = 0;
    let managedGmvForBrand = 0;
    for (const s of summaryRows)     if (dataSlugSet.has(s.brand_slug)) currentGmv += s.total_gmv;
    for (const s of prevSummaryRows) if (dataSlugSet.has(s.brand_slug)) prevGmv    += s.total_gmv;
    for (const ds of dataSlugSet)  managedGmvForBrand += managedGmvByBrand.get(ds) ?? 0;

    // Per-brand ROI: trailing-30d managed GMV ÷ this brand's monthly retainer
    // (same basis as the portfolio ROI card).
    let managed30ForBrand = 0;
    for (const ds of dataSlugSet) managed30ForBrand += mgRoi.byStore.get(ds) ?? 0;
    let brandRetainer = 0;
    for (const s of new Set<string>([rosterSlug, ...dataSlugSet])) brandRetainer += retainerBySlug.get(s) ?? 0;
    const brandRoi = brandRetainer > 0 ? managed30ForBrand / brandRetainer : undefined;

    return {
      slug: rosterSlug,
      currentGmv,
      managedGmv: managedGmvForBrand,
      prevGmv,
      trend: pctChange(currentGmv, prevGmv),
      roi: brandRoi,
    };
  });

  // Brand movers used to live here too — they're now exclusive to /analytics's
  // Notable Changes section so the same period-vs-prior comparison only has
  // one canonical home.

  // ── Managed GMV (portfolio-level) from the canonical shared calc. Unmanaged
  // is derived right after portfolio totals below (brand-wide minus managed).
  const managedGmv = Array.from(mgPeriod.byStore.values()).reduce((a, b) => a + b, 0);

  // ── Portfolio totals ────────────────────────────────────────────────────
  const totals = summaryRows.reduce((acc, s) => {
    acc.gmv    += s.total_gmv;
    acc.orders += s.total_orders;
    return acc;
  }, { gmv: 0, orders: 0 });
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
    return acc;
  }, { gmv: 0, orders: 0 });

  const gmvTrend     = pctChange(totals.gmv,    prevTotals.gmv);
  const managedTrend = pctChange(managedGmv,    prevManagedGmv);


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
  const managedSharePct = totals.gmv > 0 ? (managedGmv / totals.gmv) * 100 : 0;


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
      : 'Awaiting first data sync';

  // "No data for this brand" is only true if the fetch actually SUCCEEDED and
  // came back empty — otherwise it's a fetch failure wearing an empty state.
  const isEmptyBrand = !totalsFailed && brandFilter && totals.gmv === 0 && totals.orders === 0;
  // Brand Performance shows only brands with activity this period.
  const activeBrandRows = rosterBrandStats.filter((b) => b.currentGmv > 0);
  const showBrandPerf = !brandFilter && activeBrandRows.length > 1;

  return (
    <div className="space-y-6">
      {/* Stale-data warning — shows when the freshest data point is >3 days old */}
      {isStale && latestDate && daysStale != null && (
        <StaleDataBanner latestDate={latestDate} daysStale={daysStale} />
      )}

      {/* Header */}
      <PageHeader
        eyebrow={brandFilter ? `${activeBrandName} · Today` : 'Portfolio · Today'}
        title={<Greeting name={userName} />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Suspense fallback={null}>
              <DateRangePicker />
            </Suspense>
            {/* "Data through" live status chip — mirrors the mockup's tinted
                `.chip.live`; green when fresh, amber when the data is stale. */}
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm',
                isStale
                  ? 'border-[var(--pulse-warn)]/30 bg-[var(--pulse-warn)]/10'
                  : 'border-[var(--pulse-pos)]/25 bg-[var(--pulse-pos)]/10',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', isStale ? 'bg-[var(--pulse-warn)]' : 'bg-[var(--pulse-pos)]')} />
              <span className="tabular-nums">{dataThroughLabel}</span>
            </span>
          </div>
        }
      />

      {/* KPI strip — 5 metrics, Managed GMV as the gradient hero (mockup).
          Flat cards (no accent left-border) to match the mockup KPIs. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-[14px] stagger-children">
        <StatCard
          label="Total GMV"
          value={totalsFailed ? '—' : formatCurrency(totals.gmv)}
          trend={totalsFailed ? undefined : gmvTrend}
          trendLabel={totalsFailed ? 'temporarily unavailable' : 'vs prev'}
          info="Total affiliate GMV across all brands in the selected period. The trend compares it to the previous period of equal length."
        />
        <StatCard
          hero
          label="Managed GMV"
          value={formatCurrency(managedGmv)}
          trend={managedTrend}
          trendLabel="vs prev"
          info="GMV driven by your managed creators in the selected period. The trend compares it to the previous period of equal length."
        />
        <StatCard
          label="Managed Share"
          value={totals.gmv > 0 ? `${managedSharePct.toFixed(0)}%` : '—'}
          subValue="of portfolio"
          info="Managed GMV as a share of total GMV — how much of all affiliate GMV your managed creators drove."
        />
        <StatCard
          label="ROI · 30d"
          value={roi > 0 ? `${roi.toFixed(1)}×` : 'N/A'}
          subValue="GMV / retainer"
          info="Trailing-30-day managed GMV divided by total monthly retainer. Always a fixed 30-day window, regardless of the selected range."
        />
        <StatCard
          label="Retainers /mo"
          value={formatCurrency(totalRetainerSpend)}
          subValue={`across ${retainerBrandCount} brand${retainerBrandCount === 1 ? '' : 's'}`}
          info="Total monthly retainer you pay, summed across brands that carry one."
        />
      </div>

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

      {/* Row 2 — Managed GMV trend + Managed-vs-Organic split (mockup) */}
      {!isEmptyBrand && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <ManagedGmvChart
              data={managedDaily}
              trend={managedTrend}
              label={`${brandFilter ? `${activeBrandName} · ` : ''}Managed GMV · ${periodLength}d`}
            />
          </div>
          <Card className="lg:col-span-1">
            <CardHeader><CardTitle eyebrow>Managed vs Organic</CardTitle></CardHeader>
            <CardContent>
              {/* Organic is derived from total GMV — without it the donut would
                  read a flat "100% managed", so say nothing rather than lie. */}
              {totalsFailed ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Split unavailable — total GMV couldn&apos;t be loaded.
                </p>
              ) : (
                <ManagedOrganicDonut managed={managedGmv} organic={unmanagedGmv} />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Row 3 — Brand Performance + Roster Health (mockup). Roster Health is
          Suspense-streamed: it runs a heavy internal /api/roster call, so it
          fills in after the rest of the page rather than blocking navigation. */}
      {!isEmptyBrand && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {showBrandPerf && (
            <div className="lg:col-span-2">
              <BrandPerformance brands={activeBrandRows} range={params.range} start={params.start} end={params.end} />
            </div>
          )}
          <div className={showBrandPerf ? 'lg:col-span-1' : 'lg:col-span-3'}>
            <Suspense fallback={<RosterHealthSkeleton />}>
              {/* Brand-scoped only — NOT range-scoped. These five counts are all
                  period-independent (roster size, a fixed 14d silent threshold,
                  month-to-date pace), and feeding them the page's range made the
                  card report 84 healthy on ?range=last7 vs 530 with no param. */}
              <RosterHealthSection brand={brandFilter} />
            </Suspense>
          </div>
        </div>
      )}

      {/* Row 4 — Top Creators + Top Videos leaderboards (managed, by GMV) */}
      {!isEmptyBrand && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TopCreators creators={topCreators} label={`${periodLength}d`} />
          <TopVideos videos={topVideos} label={`${periodLength}d`} />
        </div>
      )}
    </div>
  );
}
