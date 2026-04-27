export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { getBrandSummary, getCreatorRankings, getDailyTrend } from '@/lib/data/rpc';
import { resolveDateRange } from '@/lib/data/date-utils';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { StatCard } from '@/components/dashboard/stat-card';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { BrandTicker } from '@/components/dashboard/brand-ticker';
import { VideoSection } from '@/components/dashboard/video-section';
import { aggregateCreatorsByRealName } from '@/lib/data/creator-aggregate';
import { getDashboardVideos } from '@/lib/data/video-sections';
import { getCreatorRetainers } from '@/lib/data/retainer';
import { BRAND_COLORS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import { createClient } from '@/lib/supabase/server';
import { getActiveTenantId } from '@/lib/auth/platform-admin';
import { GmvAreaChart } from '@/components/charts/gmv-area-chart';
import { ManagedSplitDonut } from '@/components/charts/managed-split-donut';
import { TopCreatorsBar } from '@/components/charts/top-creators-bar';
import { DailyBrief, type DailyBriefActionItem } from '@/components/dashboard/daily-brief';

import { format, subDays, differenceInDays } from 'date-fns';

interface Props {
  searchParams: Promise<{ range?: string; brand?: string }>;
}

export default async function AdminDashboard({ searchParams }: Props) {
  const params = await searchParams;
  const { startDate, endDate, preset } = resolveDateRange(params.range);
  const isYesterday = preset === 'yesterday';

  // Load brands dynamically from database (tenant-scoped via RLS, or explicit tenant for platform admin)
  const supabase = await createClient();
  const activeTenantId = await getActiveTenantId();
  // Honor user's allowed_brands restriction (if any)
  const { getAllowedBrandsForUser } = await import('@/lib/data/brands');
  const allowedBrands = await getAllowedBrandsForUser();

  let brandsQuery = supabase.from('brands_v2').select('slug').eq('is_archived', false).order('name');
  if (activeTenantId) brandsQuery = brandsQuery.eq('tenant_id', activeTenantId);
  if (allowedBrands) brandsQuery = brandsQuery.in('slug', allowedBrands);
  const { data: dbBrands } = await brandsQuery;
  const ALL_BRANDS = (dbBrands ?? []).map(b => b.slug);

  // No brands = new tenant, show premium onboarding experience
  if (ALL_BRANDS.length === 0) {
    // Get tenant state for step completion
    const { data: { user } } = await supabase.auth.getUser();
    let tenantData: { tiktok_connected: boolean; stripe_subscription_id: string | null; creators_added: boolean; discord_connected: boolean } | null = null;
    if (user) {
      const { data: profile } = await supabase.from('user_profiles').select('tenant_id').eq('user_id', user.id).maybeSingle();
      if (profile?.tenant_id) {
        const { data: t } = await supabase.from('tenants').select('tiktok_connected, stripe_subscription_id, creators_added, discord_connected').eq('id', profile.tenant_id).single();
        tenantData = t;
      }
    }
    const tiktokDone = tenantData?.tiktok_connected ?? false;
    const planDone = !!tenantData?.stripe_subscription_id;
    const creatorsDone = tenantData?.creators_added ?? false;
    const discordDone = tenantData?.discord_connected ?? false;
    const requiredDone = tiktokDone && planDone;
    const requiredCompleted = [tiktokDone, planDone].filter(Boolean).length;
    const progressPct = Math.round((requiredCompleted / 2) * 100);

    return (
      <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">
        {/* Hero welcome */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1A1B3A] via-[#2D1B69] to-[#1A1B3A] p-8 md:p-12 text-white">
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-[#FF4D8D]/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-[#7C5CFC]/20 to-transparent rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
                <span className="text-xl">{requiredDone ? '🎉' : '🚀'}</span>
              </div>
              <span className="text-sm font-medium text-white/60 uppercase tracking-wider">
                {requiredDone ? 'Almost there' : 'Getting Started'}
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-3">
              {requiredDone ? 'Great progress!' : 'Welcome to Tempo'}
            </h1>
            <p className="text-lg text-white/70 max-w-xl">
              {requiredDone
                ? 'Your plan is active! Connect your TikTok Shop to start syncing performance data.'
                : 'Let\u0027s get your TikTok Shop data flowing. Complete the steps below to unlock your dashboard.'}
            </p>
            {/* Progress bar */}
            <div className="mt-6 max-w-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-white/80">{requiredCompleted} of 2 required steps complete</span>
                <span className="text-sm font-bold text-white">{progressPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] transition-all duration-700" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Required steps */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Step 1: Connect TikTok */}
          {tiktokDone ? (
            <div className="rounded-2xl border-2 border-green-200 bg-gradient-to-br from-green-50 to-white p-6 flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              </div>
              <div>
                <h3 className="font-semibold text-green-900">TikTok Shop Connected</h3>
                <p className="text-sm text-green-700/70 mt-0.5">Your data is syncing automatically.</p>
              </div>
            </div>
          ) : (
            <a href="/settings" className="group rounded-2xl border-2 border-[#FF4D8D]/30 bg-gradient-to-br from-[#FF4D8D]/5 to-white p-6 hover:border-[#FF4D8D]/60 hover:shadow-lg hover:shadow-[#FF4D8D]/10 transition-all duration-300 block">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#FF4D8D] to-[#FF4D8D]/80 flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#FF4D8D]/20">
                  <span className="text-2xl">🎵</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">Connect TikTok Shop</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#FF4D8D]/10 text-[#FF4D8D]">Required</span>
                  </div>
                  <p className="text-sm text-gray-500">Add Tempo as a sub-account to start syncing your creator and sales data automatically.</p>
                </div>
              </div>
              <div className="mt-5 w-full py-2.5 rounded-xl bg-gradient-to-r from-[#FF4D8D] to-[#FF4D8D]/90 text-white text-sm font-semibold text-center hover:opacity-90 transition-opacity shadow-md shadow-[#FF4D8D]/20">
                Connect TikTok Shop
              </div>
            </a>
          )}

          {/* Step 2: Choose Plan */}
          {planDone ? (
            <div className="rounded-2xl border-2 border-green-200 bg-gradient-to-br from-green-50 to-white p-6 flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              </div>
              <div>
                <h3 className="font-semibold text-green-900">Plan Active</h3>
                <p className="text-sm text-green-700/70 mt-0.5">Your subscription is active. Full access unlocked.</p>
              </div>
            </div>
          ) : (
            <a href="/settings" className="group rounded-2xl border-2 border-[#7C5CFC]/30 bg-gradient-to-br from-[#7C5CFC]/5 to-white p-6 hover:border-[#7C5CFC]/60 hover:shadow-lg hover:shadow-[#7C5CFC]/10 transition-all duration-300 block">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#7C5CFC] to-[#7C5CFC]/80 flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#7C5CFC]/20">
                  <span className="text-2xl">💎</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">Choose Your Plan</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#7C5CFC]/10 text-[#7C5CFC]">Required</span>
                  </div>
                  <p className="text-sm text-gray-500">Subscribe to unlock your full analytics dashboard, creator rankings, and daily performance briefs.</p>
                </div>
              </div>
              <div className="mt-5 w-full py-2.5 rounded-xl bg-gradient-to-r from-[#7C5CFC] to-[#7C5CFC]/90 text-white text-sm font-semibold text-center hover:opacity-90 transition-opacity shadow-md shadow-[#7C5CFC]/20">
                View Plans
              </div>
            </a>
          )}
        </div>

        {/* Optional steps */}
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Optional</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {/* Add Creators */}
            {creatorsDone ? (
              <div className="rounded-2xl border border-green-200 bg-green-50/50 p-5 flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-green-500 flex items-center justify-center flex-shrink-0">
                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                </div>
                <div>
                  <h3 className="font-semibold text-green-900 text-sm">Creators Added</h3>
                  <p className="text-xs text-green-700/70">Your managed roster is being tracked.</p>
                </div>
              </div>
            ) : (
              <a href="/roster" className="group rounded-2xl border border-gray-200 bg-white p-5 hover:border-gray-300 hover:shadow-md transition-all duration-300 flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#7C5CFC] to-[#7C5CFC]/80 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">👥</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 text-sm">Add Your Creators</h3>
                  <p className="text-xs text-gray-500">Upload your managed roster for performance and ROI tracking.</p>
                </div>
                <span className="px-3 py-1.5 rounded-lg border border-[#7C5CFC]/30 text-xs font-semibold text-[#7C5CFC] group-hover:bg-[#7C5CFC]/5 transition-colors flex-shrink-0">Set up</span>
              </a>
            )}

            {/* Connect Discord */}
            {discordDone ? (
              <div className="rounded-2xl border border-green-200 bg-green-50/50 p-5 flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-green-500 flex items-center justify-center flex-shrink-0">
                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                </div>
                <div>
                  <h3 className="font-semibold text-green-900 text-sm">Discord Connected</h3>
                  <p className="text-xs text-green-700/70">Tempo Bot is active in your server.</p>
                </div>
              </div>
            ) : (
              <a href="/settings" className="group rounded-2xl border border-gray-200 bg-white p-5 hover:border-gray-300 hover:shadow-md transition-all duration-300 flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#5865F2] to-[#5865F2]/80 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">💬</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 text-sm">Connect Discord</h3>
                  <p className="text-xs text-gray-500">Enable Tempo Bot for messaging, alerts, and creator communication.</p>
                </div>
                <span className="px-3 py-1.5 rounded-lg border border-[#5865F2]/30 text-xs font-semibold text-[#5865F2] group-hover:bg-[#5865F2]/5 transition-colors flex-shrink-0">Set up</span>
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  const brandFilter = params.brand && ALL_BRANDS.includes(params.brand)
    ? params.brand
    : null;

  const activeBrands = brandFilter ? [brandFilter] : ALL_BRANDS;

  // Previous period for comparison
  const start = new Date(startDate);
  const end = new Date(endDate);
  const periodLength = differenceInDays(end, start) + 1;
  const prevEnd = subDays(start, 1);
  const prevStart = subDays(prevEnd, periodLength - 1);
  const prevStartDate = format(prevStart, 'yyyy-MM-dd');
  const prevEndDate = format(prevEnd, 'yyyy-MM-dd');

  const serverNow = new Date();

  async function fetchSummary(brand: string, start: string, end: string) {
    try {
      const data = await getBrandSummary(brand, start, end);
      return { brand, data: data[0] ?? null };
    } catch {
      return { brand, data: null };
    }
  }

  // Single parallel fetch — all data in one shot
  const [
    summaries,
    prevSummaries,
    allBrandSummariesRaw,
    allBrandPrevSummariesRaw,
    creatorsNested,
    videoSections,
    retainerMap,
    managedCount,
    trendsByBrandRaw,
  ] = await Promise.all([
    Promise.all(activeBrands.map(b => fetchSummary(b, startDate, endDate))),
    Promise.all(activeBrands.map(b => fetchSummary(b, prevStartDate, prevEndDate))),
    // Only fetch all-brand summaries when a brand filter is active (used for ticker)
    brandFilter
      ? Promise.all(ALL_BRANDS.map(b => fetchSummary(b, startDate, endDate)))
      : Promise.resolve(null),
    brandFilter
      ? Promise.all(ALL_BRANDS.map(b => fetchSummary(b, prevStartDate, prevEndDate)))
      : Promise.resolve(null),
    Promise.all(
      activeBrands.map(async (brand) => {
        try { return (await getCreatorRankings(brand, startDate, endDate, 50)).map((c) => ({ ...c, brand })); } catch { return []; }
      })
    ),
    getDashboardVideos(brandFilter, startDate, endDate),
    getCreatorRetainers(),
    supabase.from('managed_creators').select('id', { count: 'exact', head: true }).eq('status', 'Active'),
    Promise.all(activeBrands.map(b => getDailyTrend(b, startDate, endDate).catch(() => []))),
  ]);

  // Aggregate daily trend across all active brands by date
  const trendByDate = new Map<string, number>();
  for (const brandTrend of trendsByBrandRaw) {
    for (const day of brandTrend) {
      trendByDate.set(day.report_date, (trendByDate.get(day.report_date) ?? 0) + day.daily_gmv);
    }
  }
  const aggregatedTrend = Array.from(trendByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, gmv]) => ({ date, gmv }));

  const allCreators = creatorsNested.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0));
  const allBrandSummaries = allBrandSummariesRaw ?? summaries;
  const allBrandPrevSummaries = allBrandPrevSummariesRaw ?? prevSummaries;

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
    if (previous === 0) return undefined;
    return ((current - previous) / previous) * 100;
  }

  const gmvTrend = pctChange(totals.gmv, prevTotals.gmv);
  const ordersTrend = pctChange(totals.orders, prevTotals.orders);
  const itemsTrend = pctChange(totals.items, prevTotals.items);
  // ROI = Total GMV / Total Retainer Spend
  let totalRetainerSpend = 0;
  for (const [, info] of retainerMap) {
    totalRetainerSpend += info.retainer ?? 0;
  }
  const roi = totalRetainerSpend > 0 ? totals.gmv / totalRetainerSpend : 0;

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

  const isEmptyBrand = brandFilter && totals.gmv === 0 && totals.orders === 0 && totals.items === 0;

  // Managed GMV trend (compare to previous period is complex, just show values)
  const managedGmvPct = totals.gmv > 0 ? (managedSplitData.managed.gmv / totals.gmv) * 100 : 0;

  // Daily Brief action items (same logic as Creator Alerts)
  const briefActionItems: DailyBriefActionItem[] = [];
  for (const c of groupedCreators) {
    if (!c.isManaged) continue;
    const retainerAmt = c.retainer ?? 0;
    if (retainerAmt > 0 && c.total_gmv < retainerAmt * 2) {
      briefActionItems.push({ name: c.display_name, type: 'warning', detail: `GMV ${formatCurrency(c.total_gmv)} vs ${formatCurrency(retainerAmt)} retainer` });
    } else if (c.total_gmv > retainerAmt * 10 && retainerAmt > 0) {
      briefActionItems.push({ name: c.display_name, type: 'crushing', detail: `${(c.total_gmv / retainerAmt).toFixed(0)}x ROI on retainer` });
    }
    if (c.total_videos > 0 && c.total_videos <= 2 && c.total_gmv > 500) {
      briefActionItems.push({ name: c.display_name, type: 'breakout', detail: `${formatCurrency(c.total_gmv)} from just ${c.total_videos} video${c.total_videos === 1 ? '' : 's'}` });
    }
  }
  const briefDate = format(new Date(startDate), 'MMM d, yyyy');
  const briefPrevDateLabel = format(new Date(prevStartDate), 'MMM d');

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

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 stagger-children">
        <StatCard
          label="Total GMV"
          value={formatCurrency(totals.gmv)}
          trend={gmvTrend}
          trendLabel={trendLabel}
          brandColor={activeBrandColor}
          hero
          sparklineData={aggregatedTrend.length > 1 ? aggregatedTrend.map(d => d.gmv) : undefined}
        />
        <StatCard
          label="Managed Creators"
          value={formatNumber(managedCount.count ?? 0)}
          accentColor="#7C5CFC"
        />
        <StatCard
          label="ROI"
          value={roi > 0 ? `${roi.toFixed(1)}x` : 'N/A'}
          accentColor={activeBrandColor ?? '#FF4D8D'}
        />
        <StatCard
          label="Managed GMV"
          value={formatCurrency(managedSplitData.managed.gmv)}
          accentColor="#10B981"
          subValue={`${managedGmvPct.toFixed(0)}% of total`}
        />
        <StatCard
          label="Unmanaged GMV"
          value={formatCurrency(managedSplitData.unmanaged.gmv)}
          accentColor="#94A3B8"
          subValue={`${(100 - managedGmvPct).toFixed(0)}% of total`}
        />
      </div>

      {/* Brand Ticker — only show on All Brands view, filter out brands with no data */}
      {!brandFilter && <BrandTicker brands={brandStripData.filter(b => b.gmv > 0)} />}

      {/* Daily Brief — replaces trend chart on Yesterday view */}
      {isYesterday && (
        <DailyBrief
          brandName={activeBrandName}
          date={briefDate}
          prevDateLabel={briefPrevDateLabel}
          currentGmv={totals.gmv}
          prevGmv={prevTotals.gmv}
          currentOrders={totals.orders}
          prevOrders={prevTotals.orders}
          currentVideos={totals.videos}
          currentCreators={totals.creators}
          gmvTrend={gmvTrend}
          topCreator={groupedCreators[0] ? { name: groupedCreators[0].display_name, gmv: groupedCreators[0].total_gmv } : null}
          actionItems={briefActionItems}
          color={activeBrandColor ?? '#FF4D8D'}
        />
      )}

      {/* GMV Trend Chart — hidden for single-day ranges */}
      {!isYesterday && aggregatedTrend.length > 1 && (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 pt-5 pb-1 flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-[#1A1B3A]">GMV Trend</h3>
              <p className="text-xs text-gray-400 mt-0.5">{dateRangeDisplay}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-[#1A1B3A]">{formatCurrency(totals.gmv)}</p>
              {gmvTrend !== undefined && (
                <p className={`text-xs font-semibold mt-0.5 ${gmvTrend >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                  {gmvTrend >= 0 ? '↑' : '↓'} {Math.abs(gmvTrend).toFixed(1)}% vs prior period
                </p>
              )}
            </div>
          </div>
          <GmvAreaChart data={aggregatedTrend} color={activeBrandColor ?? '#FF4D8D'} height={260} />
        </div>
      )}


      {/* Analytics Row: GMV Split + Top Creators */}
      {totals.gmv > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
            <h3 className="font-semibold text-[#1A1B3A]">GMV Split</h3>
            <p className="text-xs text-gray-400 mt-0.5 mb-2">Managed vs Unmanaged creators</p>
            <ManagedSplitDonut
              managedGmv={managedSplitData.managed.gmv}
              unmanagedGmv={managedSplitData.unmanaged.gmv}
            />
          </div>
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
            <h3 className="font-semibold text-[#1A1B3A]">Top Creators</h3>
            <p className="text-xs text-gray-400 mt-0.5 mb-2">
              By GMV · {brandFilter ? (BRAND_DISPLAY_NAMES[brandFilter] ?? brandFilter) : 'All Brands'}
            </p>
            <TopCreatorsBar creators={groupedCreators} color={activeBrandColor ?? '#FF4D8D'} />
          </div>
        </div>
      )}

      {/* Empty state: no data for selected period */}
      {!isYesterday && totals.gmv === 0 && totals.orders === 0 && totals.creators === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="text-5xl mb-4">📊</div>
            <h3 className="text-lg font-bold">
              {isEmptyBrand ? `No data for ${activeBrandName} in this period` : 'Your dashboard is ready'}
            </h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm">
              {isEmptyBrand
                ? 'Try a different date range, or check back once creators have activity in this period.'
                : 'Connect your TikTok Shop to start seeing real-time GMV, creator performance, and product analytics.'
              }
            </p>
            {isEmptyBrand ? (
              <a
                href="?range=last7"
                className="mt-6 inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white border border-gray-200 text-[#1A1B3A] text-sm font-semibold hover:bg-gray-50 transition-colors"
              >
                View Last 7 Days →
              </a>
            ) : (
              <a
                href="/settings"
                className="mt-6 inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-[#FF4D8D]/20"
              >
                Connect TikTok Shop →
              </a>
            )}
          </div>
        </div>
      )}

      {/* Video Sections */}
      {/* Community Highlights + Creator Alerts — Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Community Highlights — Top 5 Creators */}
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center gap-2">
            <span className="text-lg">🏅</span>
            <h3 className="text-base font-semibold text-[#1A1B3A]">Community Highlights</h3>
            <span className="text-xs text-gray-400 ml-auto">Top creators this period</span>
          </div>
          <div className="divide-y divide-gray-50/80">
            {groupedCreators.slice(0, 5).map((c, i) => {
              const rankStyles = [
                { bg: 'from-amber-300 to-amber-500', shadow: 'shadow-amber-200/60', text: 'text-white' },
                { bg: 'from-slate-300 to-slate-400', shadow: 'shadow-slate-200/60', text: 'text-white' },
                { bg: 'from-amber-600 to-amber-700', shadow: 'shadow-amber-300/40', text: 'text-white' },
              ];
              const rank = rankStyles[i];
              const initial = (c.display_name || '?')[0].toUpperCase();
              return (
                <div key={c.display_name + i} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors">
                  {/* Rank badge */}
                  {rank ? (
                    <div className={`h-7 w-7 rounded-full bg-gradient-to-br ${rank.bg} ${rank.shadow} shadow flex items-center justify-center text-xs font-bold ${rank.text} flex-shrink-0`}>
                      {i + 1}
                    </div>
                  ) : (
                    <span className="h-7 w-7 flex items-center justify-center text-sm font-bold text-gray-300 flex-shrink-0">{i + 1}</span>
                  )}

                  {/* Creator avatar */}
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{
                      background: c.isManaged
                        ? 'linear-gradient(135deg, #FF4D8D, #7C5CFC)'
                        : 'linear-gradient(135deg, #CBD5E1, #94A3B8)',
                    }}
                  >
                    {initial}
                  </div>

                  {/* Name + stats */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-[#1A1B3A] truncate">{c.display_name}</p>
                      {c.isManaged && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#7C5CFC]/10 text-[#7C5CFC] flex-shrink-0">M</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">{formatNumber(c.total_videos)} videos · {formatNumber(c.total_orders)} orders</p>
                  </div>

                  <span className="text-sm font-bold text-[#E91E8C] flex-shrink-0">{formatCurrency(c.total_gmv)}</span>
                </div>
              );
            })}
            {groupedCreators.length === 0 && (
              <div className="px-4 py-8 text-center text-gray-400 text-sm">No creator data available</div>
            )}
          </div>
        </div>

        {/* Creator Alerts */}
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center gap-2">
            <span className="text-lg">🚨</span>
            <h3 className="text-lg font-semibold text-[#1A1B3A]">Creator Alerts</h3>
            <span className="text-xs text-gray-400 ml-auto">Needs attention</span>
          </div>
          <div className="divide-y divide-gray-50">
            {(() => {
              const alerts: { name: string; type: 'slacking' | 'crushing' | 'new'; detail: string }[] = [];

              for (const c of groupedCreators) {
                if (!c.isManaged) continue;
                const retainerAmt = c.retainer ?? 0;

                if (retainerAmt > 0 && c.total_gmv < retainerAmt * 2) {
                  alerts.push({ name: c.display_name, type: 'slacking', detail: `GMV ${formatCurrency(c.total_gmv)} vs ${formatCurrency(retainerAmt)} retainer` });
                } else if (c.total_gmv > retainerAmt * 10 && retainerAmt > 0) {
                  alerts.push({ name: c.display_name, type: 'crushing', detail: `${(c.total_gmv / retainerAmt).toFixed(0)}x ROI on retainer` });
                }
                if (c.total_videos > 0 && c.total_videos <= 2 && c.total_gmv > 500) {
                  alerts.push({ name: c.display_name, type: 'new', detail: `${formatCurrency(c.total_gmv)} GMV from just ${c.total_videos} video${c.total_videos === 1 ? '' : 's'}` });
                }
              }

              const sorted = alerts.sort((a, b) => {
                const order = { slacking: 0, new: 1, crushing: 2 };
                return order[a.type] - order[b.type];
              }).slice(0, 5);

              if (sorted.length === 0) {
                return <div className="px-4 py-8 text-center text-gray-400 text-sm">No alerts right now. Your creators are on track! ✅</div>;
              }

              return sorted.map((alert, i) => (
                <div key={`${alert.name}-${alert.type}-${i}`} className="flex items-center justify-between px-4 py-3 hover:bg-pink-50/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-base">
                      {alert.type === 'slacking' ? '⚠️' : alert.type === 'crushing' ? '🔥' : '⭐'}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-[#1A1B3A]">{alert.name}</p>
                      <p className="text-xs text-gray-400">{alert.detail}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    alert.type === 'slacking' ? 'bg-amber-50 text-amber-600' :
                    alert.type === 'crushing' ? 'bg-green-50 text-green-600' :
                    'bg-blue-50 text-blue-600'
                  }`}>
                    {alert.type === 'slacking' ? 'Underperforming' : alert.type === 'crushing' ? 'Crushing it' : 'Breakout'}
                  </span>
                </div>
              ));
            })()}
          </div>
        </div>
      </div>

      <VideoSection
        emoji="🔥"
        title="Hot Now"
        description="Recently posted videos generating $100+ in sales"
        videos={videoSections.hotNow}
      />

      <VideoSection
        emoji="📈"
        title="Rising"
        description="Videos with sustained sales momentum"
        videos={videoSections.rising}
      />

      <VideoSection
        emoji="🏆"
        title="Top Performers"
        description="Highest total GMV videos in the selected date range"
        videos={videoSections.topPerformers}
      />
    </div>
  );
}
