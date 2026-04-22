export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { resolveDateRange } from '@/lib/data/date-utils';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { BRAND_COLORS, BRAND_DISPLAY_NAMES, ACTIVE_BRANDS } from '@/lib/utils/constants';
import { StatCard } from '@/components/dashboard/stat-card';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { CreatorEditButton } from '@/components/creators/creator-edit-panel';
import { RetainerTracker } from '@/components/creators/retainer-tracker';
import { BrandFilter } from '@/components/creators/brand-filter';
import { LifetimeStats } from '@/components/creators/lifetime-stats';
import { VideoTitleButton } from '@/components/video/video-title-button';
import { classifyCreator, getStatusInfo } from '@/lib/data/creator-status';
import { CreatorTags } from '@/components/crm/creator-tags';
import { CreatorTimeline } from '@/components/crm/creator-timeline';
import { ArrowLeft, Mail, Phone, Shield, ExternalLink, UserX } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getCreatorProfile,
  getCreatorIdByHandle,
  getCreatorSummary,
  getCreatorAccountBreakdown,
  getCreatorBrandBreakdown,
  getCreatorVideos,
  getPostsThisMonth,
  getCreatorLifetimeStats,
  getManagedCreatorInfo,
} from '@/lib/data/creator-profile';
import { CreatorPageTabs } from '@/components/creators/creator-page-tabs';

interface Props {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ range?: string; brand?: string; tab?: string }>;
}

function trendPct(current: number, previous: number): number | undefined {
  if (previous === 0) return current > 0 ? 100 : undefined;
  return ((current - previous) / previous) * 100;
}

/** Initials avatar — picks a color from the brand or falls back to pink gradient */
function CreatorAvatar({ name, brand }: { name: string; brand: string }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  const color = BRAND_COLORS[brand] ?? '#E91E8C';

  return (
    <div
      className="h-16 w-16 rounded-2xl flex items-center justify-center text-xl font-extrabold text-white shadow-lg flex-shrink-0"
      style={{ background: `linear-gradient(135deg, ${color}dd, ${color}88)` }}
    >
      {initials || '?'}
    </div>
  );
}

export default async function CreatorDetailPage({ params, searchParams }: Props) {
  const { name } = await params;
  const slug = decodeURIComponent(name);
  const sp = await searchParams;

  // Accept UUID or TikTok handle
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
  let creatorId: string;

  if (isUuid) {
    creatorId = slug;
  } else {
    const id = await getCreatorIdByHandle(slug);
    if (id) {
      const qs = sp.range ? `?range=${sp.range}` : '';
      redirect(`/creators/${id}${qs}`);
    }
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
        <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center">
          <UserX className="h-8 w-8 text-gray-300" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#1A1B3A] mb-1">No full profile for @{slug}</h1>
          <p className="text-sm text-gray-400 max-w-sm">
            This creator is on your managed roster but hasn&apos;t been linked to a full performance profile yet.
            They&apos;ll appear here automatically once their TikTok data starts syncing.
          </p>
        </div>
        <Link
          href="/roster"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#E91E8C] text-white text-sm font-semibold hover:bg-[#d1177d] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to My Creators
        </Link>
      </div>
    );
  }

  const profile = await getCreatorProfile(creatorId);
  if (!profile) notFound();

  const { startDate, endDate } = resolveDateRange(sp.range);
  const selectedBrand = sp.brand || null;
  const activeTab = sp.tab || 'overview';

  const activeBrands = profile.brands.filter((b) => (ACTIVE_BRANDS as readonly string[]).includes(b));
  const activeBrandsWithData = profile.brandsWithData.filter((b) => (ACTIVE_BRANDS as readonly string[]).includes(b));

  const [summary, accountBreakdown, brandBreakdown, videos, postsThisMonth, lifetimeStats, managedInfo] =
    await Promise.all([
      getCreatorSummary(creatorId, startDate, endDate, selectedBrand ?? undefined),
      getCreatorAccountBreakdown(creatorId, startDate, endDate, selectedBrand ?? undefined),
      getCreatorBrandBreakdown(creatorId, startDate, endDate),
      getCreatorVideos(creatorId, startDate, endDate, 20, selectedBrand ?? undefined),
      getPostsThisMonth(creatorId, selectedBrand ?? undefined),
      getCreatorLifetimeStats(creatorId),
      getManagedCreatorInfo(creatorId),
    ]);

  const filteredBrandBreakdown = brandBreakdown.filter((b) =>
    (ACTIVE_BRANDS as readonly string[]).includes(b.brand)
  );

  const performanceStatus = classifyCreator(summary.total_videos);
  const perfStatusInfo = getStatusInfo(performanceStatus);
  const primaryBrand = activeBrandsWithData[0] ?? activeBrands[0] ?? '';

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-6">
      {/* ── Header card ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        {/* Thin brand-color top bar */}
        <div
          className="h-1.5 w-full"
          style={{
            background: primaryBrand
              ? `linear-gradient(90deg, ${BRAND_COLORS[primaryBrand] ?? '#E91E8C'}, ${BRAND_COLORS[primaryBrand] ?? '#E91E8C'}66)`
              : 'linear-gradient(90deg, #E91E8C, #E91E8C66)',
          }}
        />

        <div className="px-6 py-5">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            {/* Left: back + avatar + info */}
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <Link
                href="/roster"
                className="p-2 rounded-xl hover:bg-gray-100 transition-colors mt-1 flex-shrink-0"
                title="Back to My Creators"
              >
                <ArrowLeft className="h-4 w-4 text-gray-500" />
              </Link>

              <CreatorAvatar name={profile.real_name} brand={primaryBrand} />

              <div className="min-w-0 flex-1">
                {/* Name row */}
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-extrabold text-[#1A1B3A] leading-tight">
                    {profile.real_name}
                  </h1>
                  <CreatorEditButton
                    creator={{
                      id: profile.id,
                      real_name: profile.real_name,
                      email: profile.email,
                      phone: profile.phone,
                      role: profile.role,
                      status: profile.status,
                      notes: profile.notes,
                      accounts: profile.accounts.map((a) => ({
                        tiktok_username: a.tiktok_username,
                        is_primary: a.is_primary,
                      })),
                    }}
                  />
                </div>

                {/* Badges row */}
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {profile.status && (
                    <span className={cn(
                      'text-xs px-2.5 py-0.5 rounded-full font-semibold border capitalize',
                      {
                        active:   'bg-green-50 text-green-700 border-green-200',
                        churned:  'bg-red-50 text-red-600 border-red-200',
                        paused:   'bg-yellow-50 text-yellow-700 border-yellow-200',
                        applied:  'bg-blue-50 text-blue-600 border-blue-200',
                        pending:  'bg-orange-50 text-orange-600 border-orange-200',
                      }[profile.status.toLowerCase()] ?? 'bg-gray-50 text-gray-600 border-gray-200'
                    )}>
                      {profile.status}
                    </span>
                  )}
                  {profile.role && (
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold border bg-purple-50 text-purple-700 border-purple-200 capitalize">
                      {profile.role}
                    </span>
                  )}
                  {managedInfo && (
                    <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-semibold border bg-pink-50 text-[#E91E8C] border-pink-200">
                      <Shield className="h-3 w-3" /> Managed
                    </span>
                  )}
                  <span
                    className="text-xs px-2.5 py-0.5 rounded-full font-semibold border"
                    style={{
                      borderColor: perfStatusInfo.color,
                      color: perfStatusInfo.color,
                      backgroundColor: perfStatusInfo.bgColor,
                    }}
                  >
                    {perfStatusInfo.label}
                  </span>
                </div>

                {/* Handles + contact */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                  {profile.accounts.slice(0, 3).map((a) => (
                    <a
                      key={a.tiktok_username}
                      href={`https://tiktok.com/@${a.tiktok_username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-[#E91E8C] hover:underline font-medium"
                    >
                      @{a.tiktok_username}
                      <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                    </a>
                  ))}
                  {profile.accounts.length > 3 && (
                    <span className="text-xs text-gray-400">+{profile.accounts.length - 3} more</span>
                  )}
                  {profile.email && (
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Mail className="h-3 w-3" /> {profile.email}
                    </span>
                  )}
                  {profile.phone && (
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Phone className="h-3 w-3" /> {profile.phone}
                    </span>
                  )}
                </div>

                {/* Brand pills */}
                {activeBrands.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {activeBrands.map((b) => {
                      const hasData = activeBrandsWithData.includes(b);
                      const color = BRAND_COLORS[b] ?? '#6B7280';
                      return (
                        <span
                          key={b}
                          className={cn('text-xs px-2 py-0.5 rounded-full font-medium', !hasData && 'opacity-40')}
                          style={{ backgroundColor: `${color}18`, color }}
                        >
                          {BRAND_DISPLAY_NAMES[b] ?? b}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* CRM tags */}
                <div className="mt-2">
                  <CreatorTags creatorId={creatorId} />
                </div>
              </div>
            </div>

            {/* Right: date picker */}
            <div className="flex-shrink-0">
              <Suspense fallback={null}>
                <DateRangePicker />
              </Suspense>
            </div>
          </div>
        </div>
      </div>

      {/* ── Brand filter ─────────────────────────────────────────────────── */}
      {activeBrands.length > 1 && (
        <Suspense fallback={null}>
          <BrandFilter
            brands={activeBrands}
            brandsWithData={activeBrandsWithData}
            selectedBrand={selectedBrand}
          />
        </Suspense>
      )}

      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          label="Total GMV"
          value={formatCurrency(summary.total_gmv)}
          trend={trendPct(summary.total_gmv, summary.prev_gmv)}
          trendLabel="vs prior period"
          hero
          className="col-span-2 sm:col-span-1"
        />
        <StatCard
          label="Orders"
          value={formatNumber(summary.total_orders)}
          trend={trendPct(summary.total_orders, summary.prev_orders)}
          trendLabel="vs prior period"
        />
        <StatCard
          label="Items Sold"
          value={formatNumber(summary.total_items_sold)}
          trend={trendPct(summary.total_items_sold, summary.prev_items_sold)}
          trendLabel="vs prior period"
        />
        <StatCard
          label="Videos"
          value={formatNumber(summary.total_videos)}
          trend={trendPct(summary.total_videos, summary.prev_videos)}
          trendLabel="vs prior period"
        />
        <StatCard
          label="Est. Commission"
          value={formatCurrency(summary.total_commission)}
          trend={trendPct(summary.total_commission, summary.prev_commission)}
          trendLabel="vs prior period"
        />
        {managedInfo && managedInfo.retainer > 0 ? (
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 flex flex-col justify-center">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-1">Period ROI</p>
            <p className={`text-2xl font-extrabold tabular-nums ${
              summary.total_gmv / managedInfo.retainer >= 1 ? 'text-green-600' : 'text-red-500'
            }`}>
              {(summary.total_gmv / managedInfo.retainer).toFixed(1)}x
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              GMV ÷ {fmt(managedInfo.retainer)} retainer
            </p>
          </div>
        ) : (
          <StatCard
            label="Avg GMV / Video"
            value={summary.total_videos > 0 ? formatCurrency(summary.total_gmv / summary.total_videos) : '—'}
          />
        )}
      </div>

      {/* ── Managed info + retainer row ──────────────────────────────────── */}
      {managedInfo && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Managed summary */}
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 rounded-lg bg-pink-50 flex items-center justify-center">
                <Shield className="h-4 w-4 text-[#E91E8C]" />
              </div>
              <h3 className="text-sm font-bold text-[#1A1B3A]">Managed Creator</h3>
              {managedInfo.brand && (
                <span
                  className="ml-auto text-xs px-2.5 py-0.5 rounded-full font-medium"
                  style={{
                    backgroundColor: `${BRAND_COLORS[managedInfo.brand] ?? '#6B7280'}18`,
                    color: BRAND_COLORS[managedInfo.brand] ?? '#6B7280',
                  }}
                >
                  {BRAND_DISPLAY_NAMES[managedInfo.brand] ?? managedInfo.brand}
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl bg-gray-50 p-3 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Retainer</p>
                <p className="text-base font-bold text-[#1A1B3A]">
                  {managedInfo.retainer > 0 ? fmt(managedInfo.retainer) : '—'}
                </p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Posts/Mo</p>
                <p className="text-base font-bold text-[#1A1B3A]">{managedInfo.monthly_post_requirement || 30}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Status</p>
                <p className="text-base font-bold text-[#1A1B3A] capitalize">{managedInfo.status || 'Active'}</p>
              </div>
            </div>
            {managedInfo.notes && (
              <p className="mt-3 text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2 leading-relaxed">
                {managedInfo.notes}
              </p>
            )}
          </div>

          {/* Retainer tracker — always show when managed */}
          <RetainerTracker data={{
            creatorId: profile.id,
            retainer: managedInfo.retainer,
            monthlyPostRequirement: managedInfo.monthly_post_requirement,
            retainerStartDate: profile.retainer_start_date,
            postsThisMonth,
          }} />
        </div>
      )}

      {/* ── Tabbed content ───────────────────────────────────────────────── */}
      <CreatorPageTabs activeTab={activeTab}>
        {{
          overview: (
            <div className="space-y-6">
              {/* Lifetime stats */}
              <LifetimeStats stats={lifetimeStats} />

              {/* Account breakdown */}
              {accountBreakdown.length > 0 && (
                <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100">
                    <h3 className="text-sm font-bold text-[#1A1B3A]">Account Breakdown</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Performance by TikTok account</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/60">
                          <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Account</th>
                          <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Brands</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">GMV</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Orders</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Items</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Videos</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {accountBreakdown.map((a) => (
                          <tr key={a.tiktok_username} className="hover:bg-gray-50/60 transition-colors">
                            <td className="px-5 py-3.5 font-medium text-[#1A1B3A]">
                              <a
                                href={`https://tiktok.com/@${a.tiktok_username}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#E91E8C] hover:underline"
                              >
                                @{a.tiktok_username}
                              </a>
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex flex-wrap gap-1">
                                {a.brands
                                  .filter((b) => (ACTIVE_BRANDS as readonly string[]).includes(b))
                                  .map((b) => (
                                    <span
                                      key={b}
                                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                                      style={{ backgroundColor: `${BRAND_COLORS[b] ?? '#6B7280'}18`, color: BRAND_COLORS[b] ?? '#6B7280' }}
                                    >
                                      {BRAND_DISPLAY_NAMES[b] ?? b}
                                    </span>
                                  ))}
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-right font-semibold text-[#1A1B3A]">{formatCurrency(a.gmv)}</td>
                            <td className="px-5 py-3.5 text-right text-gray-500">{formatNumber(a.orders)}</td>
                            <td className="px-5 py-3.5 text-right text-gray-500">{formatNumber(a.items_sold)}</td>
                            <td className="px-5 py-3.5 text-right text-gray-500">{formatNumber(a.videos)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Brand breakdown */}
              {!selectedBrand && filteredBrandBreakdown.length > 1 && (
                <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100">
                    <h3 className="text-sm font-bold text-[#1A1B3A]">Brand Breakdown</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Performance split across brands</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/60">
                          <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Brand</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">GMV</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Orders</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Items</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Videos</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Commission</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {filteredBrandBreakdown.map((b) => (
                          <tr key={b.brand} className="hover:bg-gray-50/60 transition-colors">
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2">
                                <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: BRAND_COLORS[b.brand] ?? '#6B7280' }} />
                                <span className="font-medium text-[#1A1B3A]">{BRAND_DISPLAY_NAMES[b.brand] ?? b.brand}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-right font-semibold text-[#1A1B3A]">{formatCurrency(b.gmv)}</td>
                            <td className="px-5 py-3.5 text-right text-gray-500">{formatNumber(b.orders)}</td>
                            <td className="px-5 py-3.5 text-right text-gray-500">{formatNumber(b.items_sold)}</td>
                            <td className="px-5 py-3.5 text-right text-gray-500">{formatNumber(b.videos)}</td>
                            <td className="px-5 py-3.5 text-right text-gray-500">{formatCurrency(b.commission)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ),

          videos: (
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#1A1B3A]">Top Videos by GMV</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {selectedBrand
                      ? `Filtered to ${BRAND_DISPLAY_NAMES[selectedBrand] ?? selectedBrand} · top 20`
                      : 'Across all accounts · top 20'}
                  </p>
                </div>
                <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
                  {videos.length} videos
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-8">#</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Video</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Account</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Brand</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Product</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">GMV</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Orders</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Days</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {videos.map((v, i) => (
                      <tr key={v.video_id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-5 py-3.5 text-gray-300 font-medium tabular-nums">{i + 1}</td>
                        <td className="px-5 py-3.5 max-w-xs">
                          <VideoTitleButton
                            videoData={{
                              video_id: v.video_id,
                              video_title: v.video_title,
                              creator_name: v.creator_name,
                              brand: v.brand,
                              product_name: v.product_name,
                              gmv: v.gmv,
                              orders: v.orders,
                              items_sold: v.items_sold,
                              days_selling: v.days_selling,
                            }}
                            className="text-left font-medium text-[#1A1B3A] hover:text-[#E91E8C] hover:underline transition-colors truncate block max-w-[240px]"
                          >
                            {v.video_title}
                          </VideoTitleButton>
                        </td>
                        <td className="px-5 py-3.5 text-gray-500 text-xs">@{v.creator_name}</td>
                        <td className="px-5 py-3.5">
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: `${BRAND_COLORS[v.brand] ?? '#6B7280'}18`, color: BRAND_COLORS[v.brand] ?? '#6B7280' }}
                          >
                            {BRAND_DISPLAY_NAMES[v.brand] ?? v.brand}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-gray-500 text-xs max-w-[160px] truncate">{v.product_name || '—'}</td>
                        <td className="px-5 py-3.5 text-right font-semibold text-[#1A1B3A] tabular-nums">{formatCurrency(v.gmv)}</td>
                        <td className="px-5 py-3.5 text-right text-gray-500 tabular-nums">{formatNumber(v.orders)}</td>
                        <td className="px-5 py-3.5 text-right text-gray-500 tabular-nums">{v.days_selling}</td>
                      </tr>
                    ))}
                    {videos.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-5 py-12 text-center text-gray-400 text-sm">
                          No video data for this period
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ),

          crm: (
            <CreatorTimeline creatorId={creatorId} />
          ),
        }}
      </CreatorPageTabs>
    </div>
  );
}
