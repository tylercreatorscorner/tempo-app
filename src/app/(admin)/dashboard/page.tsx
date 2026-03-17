export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { getBrandSummary, getCreatorRankings } from '@/lib/data/rpc';
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

import { format, subDays, differenceInDays } from 'date-fns';

interface Props {
  searchParams: Promise<{ range?: string; brand?: string }>;
}

export default async function AdminDashboard({ searchParams }: Props) {
  const params = await searchParams;
  const { startDate, endDate } = resolveDateRange(params.range);

  // Load brands dynamically from database (tenant-scoped via RLS)
  const supabase = await createClient();
  const { data: dbBrands } = await supabase
    .from('brands_v2')
    .select('slug')
    .order('name');
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

  // Fetch summaries (current + previous) + all brands for alerts
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
          return { brand, data: null };
        }
      })
    ),
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
      : Promise.resolve(null),
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

  // Fetch creators + video sections + retainers in parallel
  const [allCreators, videoSections, retainerMap] = await Promise.all([
    Promise.all(
      activeBrands.map(async (brand) => {
        try { return (await getCreatorRankings(brand, startDate, endDate, 50)).map((c) => ({ ...c, brand })); } catch { return []; }
      })
    ).then((results) =>
      results.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0))
    ),
    getDashboardVideos(brandFilter, startDate, endDate),
    getCreatorRetainers(),
  ]);

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
        <StatCard label="Total GMV" value={formatCurrency(totals.gmv)} trend={gmvTrend} trendLabel={trendLabel} brandColor={activeBrandColor} />
        <StatCard label="Creators" value={formatNumber(totals.creators)} brandColor={activeBrandColor} />
        <StatCard label="ROI" value={roi > 0 ? `${roi.toFixed(1)}x` : 'N/A'} brandColor={activeBrandColor} />
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 space-y-2 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Managed GMV</p>
          <p className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#1A1B3A]">{formatCurrency(managedSplitData.managed.gmv)}</p>
          <div className="flex items-center gap-1.5">
            <span className="bg-green-50 text-green-600 text-xs font-semibold px-1.5 py-0.5 rounded-md">
              {managedGmvPct.toFixed(0)}% of total
            </span>
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 space-y-2 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Unmanaged GMV</p>
          <p className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#1A1B3A]">{formatCurrency(managedSplitData.unmanaged.gmv)}</p>
          <div className="flex items-center gap-1.5">
            <span className="bg-gray-50 text-gray-500 text-xs font-semibold px-1.5 py-0.5 rounded-md">
              {(100 - managedGmvPct).toFixed(0)}% of total
            </span>
          </div>
        </div>
      </div>

      {/* Brand Ticker — only show on All Brands view */}
      {!brandFilter && <BrandTicker brands={brandStripData} />}

      {/* Empty state */}
      {/* Empty state: no data for any brand */}
      {totals.gmv === 0 && totals.orders === 0 && totals.creators === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="text-5xl mb-4">📊</div>
            <h3 className="text-lg font-bold">
              {isEmptyBrand ? `No data for ${activeBrandName} yet` : 'Your dashboard is ready'}
            </h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm">
              {isEmptyBrand
                ? 'Data will appear once creators start generating sales for this brand.'
                : 'Connect your TikTok Shop to start seeing real-time GMV, creator performance, and product analytics.'
              }
            </p>
            {!isEmptyBrand && (
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
            <h3 className="text-lg font-semibold text-[#1A1B3A]">Community Highlights</h3>
            <span className="text-xs text-gray-400 ml-auto">Top creators this period</span>
          </div>
          <div className="divide-y divide-gray-50">
            {allCreators.slice(0, 5).map((c, i) => (
              <div key={`${c.creator_name}-${c.brand}-${i}`} className="flex items-center justify-between px-4 py-3 hover:bg-pink-50/20 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-gray-400 w-5">{i + 1}</span>
                  <div>
                    <p className="text-sm font-medium text-[#1A1B3A]">{c.creator_name}</p>
                    <p className="text-xs text-gray-400">{formatNumber(c.total_videos)} videos · {formatNumber(c.total_orders)} orders</p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-[#E91E8C]">{formatCurrency(c.total_gmv)}</span>
              </div>
            ))}
            {allCreators.length === 0 && (
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
                if (c.total_videos <= 1 && c.total_gmv > 500) {
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
        description="Posted in the last 7 days with $100+ in sales"
        videos={videoSections.hotNow}
      />

      <VideoSection
        emoji="📈"
        title="Rising"
        description="Posted 7-14 days ago with sustained sales momentum"
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
