export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { redirect, notFound } from 'next/navigation';
import { resolveDateRange } from '@/lib/data/date-utils';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { BRAND_COLORS, BRAND_DISPLAY_NAMES, ACTIVE_BRANDS } from '@/lib/utils/constants';
import { StatCard } from '@/components/dashboard/stat-card';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { CreatorEditButton } from '@/components/creators/creator-edit-panel';
import { RetainerTracker } from '@/components/creators/retainer-tracker';
import { BrandFilter } from '@/components/creators/brand-filter';
import { LifetimeStats } from '@/components/creators/lifetime-stats';
import Link from 'next/link';
import { ArrowLeft, User, Mail, Phone, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VideoTitleButton } from '@/components/video/video-title-button';
import { classifyCreator, getStatusInfo } from '@/lib/data/creator-status';
import { CreatorTags } from '@/components/crm/creator-tags';
import { CreatorTimeline } from '@/components/crm/creator-timeline';
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

interface Props {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ range?: string; brand?: string }>;
}

function trendPct(current: number, previous: number): number | undefined {
  if (previous === 0) return current > 0 ? 100 : undefined;
  return ((current - previous) / previous) * 100;
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const colors: Record<string, string> = {
    active: 'bg-green-50 text-green-700 border-green-200',
    churned: 'bg-red-50 text-red-600 border-red-200',
    paused: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    applied: 'bg-blue-50 text-blue-600 border-blue-200',
    pending: 'bg-orange-50 text-orange-600 border-orange-200',
    prospect: 'bg-blue-50 text-blue-600 border-blue-200',
  };
  return (
    <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium border capitalize', colors[status.toLowerCase()] ?? 'bg-gray-50 text-gray-600 border-gray-200')}>
      {status}
    </span>
  );
}

function RoleBadge({ role }: { role: string | null }) {
  if (!role) return null;
  return (
    <span className="text-xs px-2.5 py-1 rounded-full font-medium border bg-purple-50 text-purple-700 border-purple-200 capitalize">
      {role}
    </span>
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
    notFound();
  }

  const profile = await getCreatorProfile(creatorId);
  if (!profile) notFound();

  const { startDate, endDate } = resolveDateRange(sp.range);
  const selectedBrand = sp.brand || null;

  // Filter brands to only active ones
  const activeBrands = profile.brands.filter((b) => (ACTIVE_BRANDS as readonly string[]).includes(b));
  const activeBrandsWithData = profile.brandsWithData.filter((b) => (ACTIVE_BRANDS as readonly string[]).includes(b));

  const [summary, accountBreakdown, brandBreakdown, videos, postsThisMonth, lifetimeStats, managedInfo] = await Promise.all([
    getCreatorSummary(creatorId, startDate, endDate, selectedBrand ?? undefined),
    getCreatorAccountBreakdown(creatorId, startDate, endDate, selectedBrand ?? undefined),
    getCreatorBrandBreakdown(creatorId, startDate, endDate),
    getCreatorVideos(creatorId, startDate, endDate, 20, selectedBrand ?? undefined),
    getPostsThisMonth(creatorId, selectedBrand ?? undefined),
    getCreatorLifetimeStats(creatorId),
    getManagedCreatorInfo(creatorId),
  ]);

  // Filter brand breakdown to active brands only
  const filteredBrandBreakdown = brandBreakdown.filter((b) => (ACTIVE_BRANDS as readonly string[]).includes(b.brand));

  // Compute performance status
  const performanceStatus = classifyCreator(summary.total_videos);
  const perfStatusInfo = getStatusInfo(performanceStatus);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-gray-400">
        <Link href="/creators" className="hover:text-gray-600 transition-colors">Creators</Link>
        <span>/</span>
        <span className="text-gray-600">{profile.real_name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/creators" className="p-2 rounded-lg hover:bg-gray-100 transition-colors mt-1">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <div className="h-12 w-12 rounded-full bg-pink-50 border border-pink-100 flex items-center justify-center">
            <User className="h-6 w-6 text-[#FF4D8D]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-[#1A1B3A]">{profile.real_name}</h1>
              <CreatorEditButton creator={{
                id: profile.id,
                real_name: profile.real_name,
                email: profile.email,
                phone: profile.phone,
                role: profile.role,
                status: profile.status,
                notes: profile.notes,
                accounts: profile.accounts.map((a) => ({ tiktok_username: a.tiktok_username, is_primary: a.is_primary })),
              }} />
              <StatusBadge status={profile.status} />
              <RoleBadge role={profile.role} />
              {managedInfo && (
                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium border bg-pink-50 text-[#E91E8C] border-pink-200">
                  <Shield className="h-3 w-3" /> Managed
                </span>
              )}
              <span
                className="text-xs px-2.5 py-1 rounded-full font-medium border"
                style={{ borderColor: perfStatusInfo.color, color: perfStatusInfo.color, backgroundColor: perfStatusInfo.bgColor }}
              >
                {perfStatusInfo.label}
              </span>
            </div>

            {/* Contact info */}
            <div className="flex items-center gap-4 mt-1">
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

            {/* Brand tags - active brands only, dimmer for no-data brands */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {activeBrands.map((b) => {
                const hasData = activeBrandsWithData.includes(b);
                return (
                  <span
                    key={b}
                    className={cn(
                      'text-xs px-2 py-0.5 rounded-full font-medium',
                      !hasData && 'border border-dashed opacity-50'
                    )}
                    style={
                      hasData
                        ? { backgroundColor: `${BRAND_COLORS[b] ?? '#6B7280'}15`, color: BRAND_COLORS[b] ?? '#6B7280' }
                        : { borderColor: BRAND_COLORS[b] ?? '#6B7280', color: BRAND_COLORS[b] ?? '#6B7280' }
                    }
                  >
                    {BRAND_DISPLAY_NAMES[b] ?? b}
                  </span>
                );
              })}
            </div>

            {/* CRM Tags */}
            <div className="mt-2">
              <CreatorTags creatorId={creatorId} />
            </div>

            {/* Accounts list */}
            <p className="text-xs text-gray-400 mt-1">
              {profile.accounts.map((a) => `@${a.tiktok_username}`).join(', ')}
            </p>
          </div>
        </div>
        <Suspense fallback={null}>
          <DateRangePicker />
        </Suspense>
      </div>

      {/* Brand Filter Bar */}
      {activeBrands.length > 0 && (
        <Suspense fallback={null}>
          <BrandFilter
            brands={activeBrands}
            brandsWithData={activeBrandsWithData}
            selectedBrand={selectedBrand}
          />
        </Suspense>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          label="Total GMV"
          value={formatCurrency(summary.total_gmv)}
          trend={trendPct(summary.total_gmv, summary.prev_gmv)}
          trendLabel="vs prior period"
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
        {profile.retainer != null && profile.retainer > 0 && (
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 flex flex-col justify-center">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">Period ROI</p>
            <p className={`text-2xl font-extrabold tabular-nums ${summary.total_gmv / profile.retainer >= 1 ? 'text-green-600' : 'text-red-500'}`}>
              {(summary.total_gmv / profile.retainer).toFixed(1)}x
            </p>
            <p className="text-xs text-gray-400 mt-0.5">GMV ÷ ${profile.retainer.toLocaleString()} retainer</p>
          </div>
        )}
      </div>

      {/* Managed Creator Info */}
      {managedInfo && (
        <div className="rounded-2xl bg-pink-50/50 border border-pink-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-4 w-4 text-[#E91E8C]" />
            <h3 className="text-sm font-bold text-[#1A1B3A]">Managed Creator</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Retainer</p>
              <p className="font-semibold text-[#1A1B3A]">
                {managedInfo.retainer > 0
                  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(managedInfo.retainer)
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Posts/Mo</p>
              <p className="font-semibold text-[#1A1B3A]">{managedInfo.monthly_post_requirement || 30}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Status</p>
              <p className="font-semibold text-[#1A1B3A]">{managedInfo.status || 'Active'}</p>
            </div>
            {managedInfo.notes && (
              <div className="col-span-2 md:col-span-1">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Notes</p>
                <p className="text-gray-600 text-xs">{managedInfo.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Retainer & Post Tracking - only show when a specific brand is selected */}
      {/* TODO: Per-brand retainer storage needs a schema update. Currently uses single retainer field from managed_creators. */}
      {selectedBrand && (
        <RetainerTracker data={{
          creatorId: profile.id,
          retainer: profile.retainer,
          monthlyPostRequirement: profile.monthly_post_requirement,
          retainerStartDate: profile.retainer_start_date,
          postsThisMonth,
        }} />
      )}

      {/* Lifetime Stats */}
      <LifetimeStats stats={lifetimeStats} />

      {/* Account Breakdown */}
      {accountBreakdown.length > 0 && (
        <div className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-bold tracking-tight text-[#1A1B3A]">Account Breakdown</h3>
            <p className="text-xs text-gray-400 mt-0.5">Performance by TikTok account</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500 bg-gray-50">
                  <th className="px-4 sm:px-6 py-3 text-left font-medium text-xs uppercase tracking-wider">Account</th>
                  <th className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wider">Brands</th>
                  <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider">GMV</th>
                  <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider">Orders</th>
                  <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider">Items</th>
                  <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider pr-6">Videos</th>
                </tr>
              </thead>
              <tbody>
                {accountBreakdown.map((a) => (
                  <tr key={a.tiktok_username} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 sm:px-6 py-3.5 font-medium text-[#1A1B3A]">@{a.tiktok_username}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {a.brands.filter((b) => (ACTIVE_BRANDS as readonly string[]).includes(b)).length > 0 ? a.brands.filter((b) => (ACTIVE_BRANDS as readonly string[]).includes(b)).map((b) => (
                          <span
                            key={b}
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: `${BRAND_COLORS[b] ?? '#6B7280'}15`, color: BRAND_COLORS[b] ?? '#6B7280' }}
                          >
                            {BRAND_DISPLAY_NAMES[b] ?? b}
                          </span>
                        )) : (
                          <span className="text-xs text-gray-300">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-[#1A1B3A]">{formatCurrency(a.gmv)}</td>
                    <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums">{formatNumber(a.orders)}</td>
                    <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums">{formatNumber(a.items_sold)}</td>
                    <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums pr-6">{formatNumber(a.videos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Brand Breakdown - only show on "All Brands" view */}
      {!selectedBrand && filteredBrandBreakdown.length > 1 && (
        <div className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-bold tracking-tight text-[#1A1B3A]">Brand Breakdown</h3>
            <p className="text-xs text-gray-400 mt-0.5">Performance split across brands</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500 bg-gray-50">
                  <th className="px-4 sm:px-6 py-3 text-left font-medium text-xs uppercase tracking-wider">Brand</th>
                  <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider">GMV</th>
                  <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider">Orders</th>
                  <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider">Items</th>
                  <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider">Videos</th>
                  <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider pr-6">Commission</th>
                </tr>
              </thead>
              <tbody>
                {filteredBrandBreakdown.map((b) => (
                  <tr key={b.brand} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 sm:px-6 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: BRAND_COLORS[b.brand] ?? '#6B7280' }} />
                        <span className="font-medium text-[#1A1B3A]">{BRAND_DISPLAY_NAMES[b.brand] ?? b.brand}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-[#1A1B3A]">{formatCurrency(b.gmv)}</td>
                    <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums">{formatNumber(b.orders)}</td>
                    <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums">{formatNumber(b.items_sold)}</td>
                    <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums">{formatNumber(b.videos)}</td>
                    <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums pr-6">{formatCurrency(b.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Videos */}
      <div className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold tracking-tight text-[#1A1B3A]">Top Videos by GMV</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {selectedBrand
              ? `Filtered to ${BRAND_DISPLAY_NAMES[selectedBrand] ?? selectedBrand}, top 20`
              : 'Across all accounts, top 20 (aggregated across dates)'}
          </p>
        </div>
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr className="border-b border-gray-100 text-gray-500">
                <th className="px-4 sm:px-6 py-3 text-left font-medium text-xs uppercase tracking-wider w-12">#</th>
                <th className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wider">Video</th>
                <th className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wider">Account</th>
                <th className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wider">Brand</th>
                <th className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wider">Product</th>
                <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider">GMV</th>
                <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider">Orders</th>
                <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider">Items</th>
                <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider pr-6">Days Selling</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v, i) => (
                <tr key={v.video_id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 sm:px-6 py-3.5 text-gray-400 tabular-nums">{i + 1}</td>
                  <td className="px-4 py-3.5 font-medium max-w-xs truncate">
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
                      className="text-left text-[#1A1B3A] hover:text-[#FF4D8D] hover:underline transition-colors"
                    >
                      {v.video_title}
                    </VideoTitleButton>
                  </td>
                  <td className="px-4 py-3.5 text-gray-500">@{v.creator_name}</td>
                  <td className="px-4 py-3.5">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: `${BRAND_COLORS[v.brand] ?? '#6B7280'}15`, color: BRAND_COLORS[v.brand] ?? '#6B7280' }}
                    >
                      {BRAND_DISPLAY_NAMES[v.brand] ?? v.brand}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-gray-500 max-w-[200px] truncate">{v.product_name || '-'}</td>
                  <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-[#1A1B3A]">{formatCurrency(v.gmv)}</td>
                  <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums">{formatNumber(v.orders)}</td>
                  <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums">{formatNumber(v.items_sold)}</td>
                  <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums pr-6">{v.days_selling}</td>
                </tr>
              ))}
              {videos.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">No video data for this creator</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CRM Timeline */}
      <CreatorTimeline creatorId={creatorId} />
    </div>
  );
}
