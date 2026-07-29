export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { resolveDateRange } from '@/lib/data/date-utils';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { getBrandRegistry, brandLabel, brandColor, activeBrandSlugs } from '@/lib/data/brand-registry';
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
import { ArrowLeft, Mail, Phone, Shield, ExternalLink, UserX, AlertTriangle } from 'lucide-react';
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
  getCreatorLatestReportDate,
} from '@/lib/data/creator-profile';
import { CreatorPageTabs } from '@/components/creators/creator-page-tabs';
import { SetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';

interface Props {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ range?: string; brand?: string; tab?: string; start?: string; end?: string }>;
}

function trendPct(current: number, previous: number): number | undefined {
  if (previous === 0) return current > 0 ? 100 : undefined;
  return ((current - previous) / previous) * 100;
}

/** Initials avatar — picks a color from the brand or falls back to pink gradient */
function CreatorAvatar({ name, color }: { name: string; color: string }) {
  // Only consider words that START with an alphanumeric character — skips emoji like 💎
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

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
      const qs = new URLSearchParams();
      if (sp.range) qs.set('range', sp.range);
      if (sp.brand) qs.set('brand', sp.brand);
      if (sp.tab) qs.set('tab', sp.tab);
      const qsStr = qs.toString();
      redirect(`/creators/${id}${qsStr ? `?${qsStr}` : ''}`);
    }
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
          <UserX className="h-8 w-8 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)] mb-1">No full profile for @{slug}</h1>
          <p className="text-sm text-muted-foreground max-w-sm">
            This creator is on your managed roster but hasn&apos;t been linked to a full performance profile yet.
            They&apos;ll appear here automatically once their TikTok data starts syncing.
          </p>
        </div>
        <Link
          href="/roster"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--primary)] text-primary-foreground text-sm font-semibold hover:brightness-[1.07] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Creators
        </Link>
      </div>
    );
  }

  const profile = await getCreatorProfile(creatorId);
  if (!profile) notFound();

  // Finance: none for finance-blind scopes (e.g. coaches) — retainer dollars
  // render as "—"/absence below, never a fabricated $0. (Per-request memo, so
  // this is the same snapshot the admin layout already resolved.)
  const scope = await getWorkspaceScope();
  // Creator COST, not agency finance — the manager of this creator pays it.
  // Named for what it is, so a real finance gate here cannot reuse it by accident.
  const canViewCost = scope?.canViewCreatorCost ?? false;

  const { startDate, endDate } = resolveDateRange(sp.range, sp.start, sp.end);
  const selectedBrand = sp.brand || null;
  const activeTab = sp.tab || 'overview';

  const reg = await getBrandRegistry();
  const activeSlugs = new Set(activeBrandSlugs(reg));

  const activeBrands = profile.brands.filter((b) => activeSlugs.has(b));
  const activeBrandsWithData = profile.brandsWithData.filter((b) => activeSlugs.has(b));

  const [summary, accountBreakdown, brandBreakdown, videos, postsThisMonth, lifetimeStats, managedInfo, latestReportDate] =
    await Promise.all([
      getCreatorSummary(creatorId, startDate, endDate, selectedBrand ?? undefined),
      getCreatorAccountBreakdown(creatorId, startDate, endDate, selectedBrand ?? undefined),
      getCreatorBrandBreakdown(creatorId, startDate, endDate),
      getCreatorVideos(creatorId, startDate, endDate, 20, selectedBrand ?? undefined),
      getPostsThisMonth(creatorId, selectedBrand ?? undefined),
      getCreatorLifetimeStats(creatorId),
      getManagedCreatorInfo(creatorId),
      getCreatorLatestReportDate(creatorId),
    ]);

  // Flag the data as stale if the last data point is > 3 days old
  const daysStale = latestReportDate
    ? Math.floor((Date.now() - new Date(latestReportDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const isStale = daysStale != null && daysStale > 3;

  const filteredBrandBreakdown = brandBreakdown.filter((b) =>
    activeSlugs.has(b.brand)
  );

  // If the period has no data (data is stale OR truly inactive), classify by lifetime videos instead —
  // otherwise an active creator looks like a "Ghost" just because we haven't uploaded recent CSVs.
  const videosForClassification = summary.total_videos > 0
    ? summary.total_videos
    : (isStale ? lifetimeStats.total_videos : summary.total_videos);
  const performanceStatus = classifyCreator(videosForClassification);
  const perfStatusInfo = getStatusInfo(performanceStatus);

  // Prefer the managed brand (where they're officially signed) over whichever brand happened to
  // return data first
  const primaryBrand = managedInfo?.brand
    ?? activeBrandsWithData[0]
    ?? activeBrands[0]
    ?? '';

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-6">
      <SetBreadcrumb label={profile.real_name} />

      {/* ── Stale data banner (top priority) ─────────────────────────────── */}
      {isStale && latestReportDate && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/25 p-4 flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Performance data is {daysStale} days old
            </p>
            <p className="text-xs text-amber-500 mt-0.5">
              Last data point: {new Date(latestReportDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
              Period-based stats below may show zero until a fresh TikTok Shop upload is processed.
              Lifetime stats are still accurate.
            </p>
          </div>
        </div>
      )}

      {/* ── Header card ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
        {/* Thin brand-color top bar */}
        <div
          className="h-1.5 w-full"
          style={{
            background: primaryBrand
              ? `linear-gradient(90deg, ${brandColor(reg, primaryBrand, '#4B45FF')}, ${brandColor(reg, primaryBrand, '#4B45FF')}66)`
              : 'linear-gradient(90deg, #4B45FF, #4B45FF66)',
          }}
        />

        <div className="px-6 py-5">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            {/* Left: avatar + info (breadcrumb handles back navigation) */}
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <CreatorAvatar name={profile.real_name} color={brandColor(reg, primaryBrand, '#4B45FF')} />

              <div className="min-w-0 flex-1">
                {/* Name row */}
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-extrabold text-[var(--foreground)] leading-tight">
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
                  <a
                    href={`/api/admin/view-as-creator?creatorId=${profile.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open this creator's portal (signed in as them) in a new tab"
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    <ExternalLink className="h-3 w-3" /> View portal
                  </a>
                </div>

                {/* Badges row */}
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {profile.status && (
                    <span className={cn(
                      'text-xs px-2.5 py-0.5 rounded-md font-semibold border capitalize',
                      {
                        active:   'bg-green-500/10 text-green-500 border-green-500/25',
                        churned:  'bg-red-500/10 text-red-600 border-red-500/25',
                        paused:   'bg-yellow-500/10 text-yellow-500 border-yellow-500/25',
                        applied:  'bg-blue-500/10 text-blue-600 border-blue-500/25',
                        pending:  'bg-orange-500/10 text-orange-600 border-orange-500/25',
                      }[profile.status.toLowerCase()] ?? 'bg-muted text-muted-foreground border-border'
                    )}>
                      {profile.status}
                    </span>
                  )}
                  {profile.role && (
                    <span className="text-xs px-2.5 py-0.5 rounded-md font-semibold border bg-purple-500/10 text-purple-500 border-purple-500/25 capitalize">
                      {profile.role}
                    </span>
                  )}
                  {managedInfo && (
                    <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-md font-semibold border bg-primary/10 text-[var(--primary)] border-primary/15">
                      <Shield className="h-3 w-3" /> Managed
                    </span>
                  )}
                  <span
                    className="text-xs px-2.5 py-0.5 rounded-md font-semibold border"
                    style={{
                      // Tint the background from the status hue (not the light-only
                      // bgColor hex in creator-status.ts, which is a near-white blob
                      // on a dark card). A translucent hue reads correctly on both
                      // the light (#FFF) and dark (#17182F) card surfaces.
                      borderColor: `${perfStatusInfo.color}59`,
                      color: perfStatusInfo.color,
                      backgroundColor: `${perfStatusInfo.color}1F`,
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
                      className="flex items-center gap-1 text-xs text-[var(--primary)] hover:underline font-medium"
                    >
                      @{a.tiktok_username}
                      <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                    </a>
                  ))}
                  {profile.accounts.length > 3 && (
                    <span className="text-xs text-muted-foreground">+{profile.accounts.length - 3} more</span>
                  )}
                  {profile.email && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3" /> {profile.email}
                    </span>
                  )}
                  {profile.phone && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" /> {profile.phone}
                    </span>
                  )}
                </div>

                {/* Brand pills */}
                {activeBrands.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {activeBrands.map((b) => {
                      const hasData = activeBrandsWithData.includes(b);
                      const color = brandColor(reg, b);
                      return (
                        <span
                          key={b}
                          className={cn('text-xs px-2 py-0.5 rounded-md font-medium', !hasData && 'opacity-40')}
                          style={{ backgroundColor: `${color}18`, color }}
                        >
                          {brandLabel(reg, b)}
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
        {managedInfo && managedInfo.retainer > 0 && !canViewCost ? (
          // Finance-blind viewer: ROI divides by the retainer and the subline
          // spells out the dollars — both render as absence, never numbers.
          <StatCard
            label="Period ROI"
            value="—"
            className="col-span-2 sm:col-span-1"
          />
        ) : managedInfo && managedInfo.retainer > 0 ? (() => {
          const roi = summary.total_gmv / managedInfo.retainer;
          const roiColor = roi >= 1 ? '#00C853' : '#F44336';
          return (
            <StatCard
              label="Period ROI"
              value={`${roi.toFixed(1)}x`}
              subValue={`GMV / ${fmt(managedInfo.retainer)} retainer`}
              accentColor={roiColor}
              className="col-span-2 sm:col-span-1"
            />
          );
        })() : (
          <StatCard
            label="Avg GMV / Video"
            value={summary.total_videos > 0 ? formatCurrency(summary.total_gmv / summary.total_videos) : '—'}
            className="col-span-2 sm:col-span-1"
          />
        )}
      </div>

      {/* ── Retainer tracker (managed creators only) ─────────────────────── */}
      {managedInfo && (
        <div className={cn(managedInfo.notes ? 'grid grid-cols-1 lg:grid-cols-3 gap-4' : '')}>
          <div className={managedInfo.notes ? 'lg:col-span-2' : ''}>
            <RetainerTracker data={{
              creatorId: profile.id,
              // Withheld (null) from finance-blind viewers — the tracker keeps
              // the post-quota progress but omits the dollar figure entirely.
              retainer: canViewCost ? managedInfo.retainer : null,
              monthlyPostRequirement: managedInfo.monthly_post_requirement,
              retainerStartDate: profile.retainer_start_date,
              postsThisMonth,
            }} />
          </div>
          {managedInfo.notes && (
            <div className="rounded-2xl bg-card border border-border shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Shield className="h-3.5 w-3.5 text-[var(--primary)]" />
                </div>
                <h3 className="text-sm font-bold text-[var(--foreground)]">Notes</h3>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {managedInfo.notes}
              </p>
            </div>
          )}
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
                <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-border">
                    <h3 className="text-sm font-bold text-[var(--foreground)]">Account Breakdown</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Performance by TikTok account · selected period (not lifetime)</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/60">
                          <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account</th>
                          <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Brands</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">GMV</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Orders</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Items</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Videos</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {accountBreakdown.map((a) => (
                          <tr key={a.tiktok_username} className="hover:bg-muted/60 transition-colors">
                            <td className="px-5 py-3.5 font-medium text-[var(--foreground)]">
                              <a
                                href={`https://tiktok.com/@${a.tiktok_username}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[var(--primary)] hover:underline"
                              >
                                @{a.tiktok_username}
                              </a>
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex flex-wrap gap-1">
                                {a.brands
                                  .filter((b) => activeSlugs.has(b))
                                  .map((b) => (
                                    <span
                                      key={b}
                                      className="text-xs px-2 py-0.5 rounded-md font-medium"
                                      style={{ backgroundColor: `${brandColor(reg, b)}18`, color: brandColor(reg, b) }}
                                    >
                                      {brandLabel(reg, b)}
                                    </span>
                                  ))}
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-right font-semibold text-[var(--foreground)]">{formatCurrency(a.gmv)}</td>
                            <td className="px-5 py-3.5 text-right text-muted-foreground">{formatNumber(a.orders)}</td>
                            <td className="px-5 py-3.5 text-right text-muted-foreground">{formatNumber(a.items_sold)}</td>
                            <td className="px-5 py-3.5 text-right text-muted-foreground">{formatNumber(a.videos)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Brand breakdown */}
              {!selectedBrand && filteredBrandBreakdown.length > 1 && (
                <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-border">
                    <h3 className="text-sm font-bold text-[var(--foreground)]">Brand Breakdown</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Performance split across brands · selected period (not lifetime)</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/60">
                          <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Brand</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">GMV</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Orders</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Items</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Videos</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Commission</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredBrandBreakdown.map((b) => (
                          <tr key={b.brand} className="hover:bg-muted/60 transition-colors">
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2">
                                <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: brandColor(reg, b.brand) }} />
                                <span className="font-medium text-[var(--foreground)]">{brandLabel(reg, b.brand)}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-right font-semibold text-[var(--foreground)]">{formatCurrency(b.gmv)}</td>
                            <td className="px-5 py-3.5 text-right text-muted-foreground">{formatNumber(b.orders)}</td>
                            <td className="px-5 py-3.5 text-right text-muted-foreground">{formatNumber(b.items_sold)}</td>
                            <td className="px-5 py-3.5 text-right text-muted-foreground">{formatNumber(b.videos)}</td>
                            <td className="px-5 py-3.5 text-right text-muted-foreground">{formatCurrency(b.commission)}</td>
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
            <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[var(--foreground)]">Top Videos by GMV</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selectedBrand
                      ? `Filtered to ${brandLabel(reg, selectedBrand)}`
                      : 'Across all accounts'}
                    {summary.total_videos > 20 ? ` · showing top 20 of ${formatNumber(summary.total_videos)}` : ''}
                  </p>
                </div>
                <span className="text-xs font-semibold text-muted-foreground bg-muted px-2.5 py-1 rounded-md">
                  {videos.length} shown
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/60">
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground w-8">#</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Video</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Brand</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Product</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">GMV</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Orders</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Days</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {videos.map((v, i) => (
                      <tr key={v.video_id} className="hover:bg-muted/60 transition-colors">
                        <td className="px-5 py-3.5 text-muted-foreground font-medium tabular-nums">{i + 1}</td>
                        <td className="px-5 py-3.5 min-w-[200px] max-w-[360px]">
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
                            className="text-left font-medium text-[var(--foreground)] hover:text-[var(--primary)] hover:underline transition-colors truncate block w-full"
                          >
                            {v.video_title}
                          </VideoTitleButton>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground text-xs">@{v.creator_name}</td>
                        <td className="px-5 py-3.5">
                          <span
                            className="text-xs px-2 py-0.5 rounded-md font-medium"
                            style={{ backgroundColor: `${brandColor(reg, v.brand)}18`, color: brandColor(reg, v.brand) }}
                          >
                            {brandLabel(reg, v.brand)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground text-xs max-w-[160px] truncate">{v.product_name || '—'}</td>
                        <td className="px-5 py-3.5 text-right font-semibold text-[var(--foreground)] tabular-nums">{formatCurrency(v.gmv)}</td>
                        <td className="px-5 py-3.5 text-right text-muted-foreground tabular-nums">{formatNumber(v.orders)}</td>
                        <td className="px-5 py-3.5 text-right text-muted-foreground tabular-nums">{v.days_selling}</td>
                      </tr>
                    ))}
                    {videos.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground text-sm">
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
