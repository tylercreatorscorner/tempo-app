import { Suspense } from 'react';
import { redirect, notFound } from 'next/navigation';
import { resolveDateRange } from '@/lib/data/date-utils';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { BRAND_COLORS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import { StatCard } from '@/components/dashboard/stat-card';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { CreatorEditButton } from '@/components/creators/creator-edit-panel';
import { RetainerTracker } from '@/components/creators/retainer-tracker';
import Link from 'next/link';
import { ArrowLeft, User, Mail, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getCreatorProfile,
  getCreatorIdByHandle,
  getCreatorSummary,
  getCreatorAccountBreakdown,
  getCreatorBrandBreakdown,
  getCreatorVideos,
  getPostsThisMonth,
} from '@/lib/data/creator-profile';

interface Props {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ range?: string }>;
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

  const isNumericId = /^\d+$/.test(slug);
  let creatorId: number;

  if (isNumericId) {
    creatorId = parseInt(slug, 10);
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

  const [summary, accountBreakdown, brandBreakdown, videos, postsThisMonth] = await Promise.all([
    getCreatorSummary(creatorId, startDate, endDate),
    getCreatorAccountBreakdown(creatorId, startDate, endDate),
    getCreatorBrandBreakdown(creatorId, startDate, endDate),
    getCreatorVideos(creatorId, startDate, endDate, 20),
    getPostsThisMonth(creatorId),
  ]);

  // Bug fix #1: brands from creator_performance, not managed_creators
  const uniqueBrands = profile.brands;

  return (
    <div className="space-y-6">
      {/* Breadcrumb - Bug fix #4: show real_name not numeric ID */}
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

            {/* Brand tags - Bug fix #1: from creator_performance */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {uniqueBrands.map((b) => (
                <span
                  key={b}
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: `${BRAND_COLORS[b] ?? '#6B7280'}15`, color: BRAND_COLORS[b] ?? '#6B7280' }}
                >
                  {BRAND_DISPLAY_NAMES[b] ?? b}
                </span>
              ))}
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
      </div>

      {/* Retainer & Post Tracking - Feature #7 */}
      <RetainerTracker data={{
        creatorId: profile.id,
        retainer: profile.retainer,
        monthlyPostRequirement: profile.monthly_post_requirement,
        retainerStartDate: profile.retainer_start_date,
        postsThisMonth,
      }} />

      {/* Account Breakdown - Bug fix #2: brands from performance data */}
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
                        {a.brands.length > 0 ? a.brands.map((b) => (
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

      {/* Brand Breakdown */}
      {brandBreakdown.length > 1 && (
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
                {brandBreakdown.map((b) => (
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

      {/* Top Videos - Bug fix #3: grouped by video_id with Days Selling */}
      <div className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold tracking-tight text-[#1A1B3A]">Top Videos by GMV</h3>
          <p className="text-xs text-gray-400 mt-0.5">Across all accounts, top 20 (aggregated across dates)</p>
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
                  <td className="px-4 py-3.5 font-medium max-w-xs truncate text-[#1A1B3A]">{v.video_title}</td>
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
    </div>
  );
}
