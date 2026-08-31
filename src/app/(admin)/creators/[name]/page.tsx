export const dynamic = 'force-dynamic';

/**
 * Admin creator profile — rebuilt 2026-08 for the CONTENT COACH.
 *
 * The page this replaces answered "how much money" five ways (GMV, orders,
 * items sold, videos, commission) and could not answer either question a coach
 * actually brings to a weekly call:
 *
 *   1. Are they posting where we pay them to post?
 *   2. Is the content working?
 *
 * Both are now the first two things on the page. Three rules held throughout:
 *
 * · Nothing here reads a dead table. creator_tags, creator_notes,
 *   creator_tasks, creator_status_history, video_reviews and contest_entrants
 *   are all 0 rows; creator_triage was last calculated 2026-02-12 and
 *   creator_outreach last written 2026-01-15. The old CRM tab and tag widget
 *   rendered those and have been removed rather than dressed up.
 *
 * · Posts PUBLISHED and posts ACTIVE are never given the same name. They
 *   differ by more than an order of magnitude (Akiek, Dr. Dent, August: 21
 *   published against 268 active) and conflating them is what made the old
 *   retainer tracker report 893% of a 30-post quota.
 *
 * · Retainer dollars stay behind canViewCreatorCost. A coach is finance-blind
 *   by design, and every gated figure renders as absence, never as $0.
 */

import { Suspense } from 'react';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { resolveDateRange } from '@/lib/data/date-utils';
import { getDataAnchorDate } from '@/lib/data/data-anchor';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { getBrandRegistry, brandLabel, brandColor, activeBrandSlugs, slugToUuid } from '@/lib/data/brand-registry';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { CreatorEditButton } from '@/components/creators/creator-edit-panel';
import { CreatorChangeHistory } from '@/components/creators/creator-change-history';
import { BrandFilter } from '@/components/creators/brand-filter';
import { VideoTitleButton } from '@/components/video/video-title-button';
import { classifyCreator, getStatusInfo } from '@/lib/data/creator-status';
import { ArrowLeft, Mail, Phone, ExternalLink, UserX, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getCreatorProfile,
  getCreatorIdByHandle,
  getCreatorSummary,
  getCreatorAccountBreakdown,
  getCreatorBrandBreakdown,
  getCreatorVideos,
  getPostsPublishedThisMonth,
  getCreatorLifetimeStats,
  getCreatorContracts,
  getCreatorEngagement,
  getCreatorTopContent,
  getCreatorLatestReportDate,
  getCreatorChangeHistory,
} from '@/lib/data/creator-profile';
import { SetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';

interface Props {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ range?: string; brand?: string; tab?: string; start?: string; end?: string }>;
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
      const qsStr = qs.toString();
      redirect(`/creators/${id}${qsStr ? `?${qsStr}` : ''}`);
    }
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
          <UserX className="h-8 w-8 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground mb-1">No full profile for @{slug}</h1>
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

  // Creator COST, not agency finance — the manager of this creator pays it.
  // Named for what it is, so a real finance gate here cannot reuse it by accident.
  const scope = await getWorkspaceScope();
  const canViewCost = scope?.canViewCreatorCost ?? false;

  const selectedBrand = sp.brand || null;

  // Rolling presets end at the last day with data, not calendar yesterday.
  // Scoped to what this page is showing, never per brand inside a total.
  // See the note on resolveDateRange.
  const dataThrough = await getDataAnchorDate(
    selectedBrand ? [selectedBrand] : (profile.brandsWithData.length ? profile.brandsWithData : null));
  const { startDate, endDate, lagDays, anchorDate } = resolveDateRange(sp.range, sp.start, sp.end, dataThrough);
  // Non-null only when the window actually moved; see DateRangePicker.
  const staleThrough = lagDays > 0 ? anchorDate : null;

  const reg = await getBrandRegistry();
  const activeSlugs = new Set(activeBrandSlugs(reg));
  const activeBrands = profile.brands.filter((b) => activeSlugs.has(b));
  const activeBrandsWithData = profile.brandsWithData.filter((b) => activeSlugs.has(b));

  const contracts = await getCreatorContracts(creatorId);
  const contractBrand = contracts.primary?.brand ?? null;

  // Which brand an edit to role/status applies to. The filtered brand if one is
  // chosen, else the contract brand the panel's values were read from. Null
  // when the creator holds no contract, and the panel then hides those fields
  // rather than showing them editing nothing.
  const editBrandSlug = selectedBrand ?? contractBrand;
  const editBrandId = editBrandSlug ? (slugToUuid(reg, editBrandSlug) ?? null) : null;

  const [summary, accountBreakdown, brandBreakdown, videos, lifetimeStats, engagement, topContent, latestReportDate, contractPosts] =
    await Promise.all([
      getCreatorSummary(creatorId, startDate, endDate, selectedBrand ?? undefined),
      getCreatorAccountBreakdown(creatorId, startDate, endDate, selectedBrand ?? undefined),
      getCreatorBrandBreakdown(creatorId, startDate, endDate),
      getCreatorVideos(creatorId, startDate, endDate, 20, selectedBrand ?? undefined),
      getCreatorLifetimeStats(creatorId),
      // Both take the brand for the same reason the three calls above do. They
      // used to ignore it, so on a creator working several brands these two
      // cells of the metric rail stayed identical while the rest moved.
      getCreatorEngagement(creatorId, startDate, endDate, selectedBrand ?? undefined),
      getCreatorTopContent(creatorId, startDate, endDate, 8, selectedBrand ?? undefined),
      getCreatorLatestReportDate(creatorId),
      // Scoped to the CONTRACT brand: the requirement is a promise to one
      // brand, so counting posts made for a different one would forgive a
      // creator who is busy everywhere except where we pay them.
      contractBrand ? getPostsPublishedThisMonth(creatorId, contractBrand) : Promise.resolve(0),
    ]);

  const daysStale = latestReportDate
    ? Math.floor((Date.now() - new Date(latestReportDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const isStale = daysStale != null && daysStale > 3;

  const effort = brandBreakdown
    .filter((b) => activeSlugs.has(b.brand))
    .sort((a, b) => b.gmv - a.gmv);

  // Classify off lifetime videos when the period is empty but the data is
  // stale — otherwise an active creator reads as a "Ghost" because nobody has
  // uploaded a CSV this week.
  const videosForClassification = summary.total_videos > 0
    ? summary.total_videos
    : (isStale ? lifetimeStats.total_videos : summary.total_videos);
  const perfStatusInfo = getStatusInfo(classifyCreator(videosForClassification));

  const primaryBrandForColor = contractBrand ?? activeBrandsWithData[0] ?? activeBrands[0] ?? '';
  const accent = brandColor(reg, primaryBrandForColor, '#4B45FF');

  const engagementRate = engagement && engagement.views > 0
    ? (engagement.likes / engagement.views) * 100
    : null;
  const gmvPerPost = summary.total_videos > 0 ? summary.total_gmv / summary.total_videos : null;

  // Contract ROI is the CONTRACT brand's GMV against the contract retainer,
  // never total GMV against it. Akiek works 13 brands; measuring all of them
  // against one brand's retainer overstates that contract's return by 57%.
  const contractGmv = contractBrand
    ? (effort.find((b) => b.brand === contractBrand)?.gmv ?? 0)
    : 0;
  // Change history spans every roster row this creator holds — one per brand —
  // so the timeline is the person's, not one contract's. Retainer gating is
  // applied in the data layer, not here.
  const changeHistory = await getCreatorChangeHistory(
    [contracts.primary, ...contracts.others].filter(Boolean).map((c) => c!.managedId),
    canViewCost,
  );

  const contractRoi = contracts.primary && contracts.primary.retainer > 0
    ? contractGmv / contracts.primary.retainer
    : null;

  // The coaching insight: where the effort goes versus where it returns.
  // Only worth stating when there IS a weak brand to name and a strong one to
  // compare it to, so it stays a finding rather than furniture.
  const withPosts = effort.filter((b) => b.videos > 0);
  const best = withPosts.length > 1
    ? withPosts.reduce((m, b) => (b.gmv / b.videos > m.gmv / m.videos ? b : m))
    : null;
  const worst = withPosts.length > 1
    ? withPosts.reduce((m, b) => (b.gmv / b.videos < m.gmv / m.videos ? b : m))
    : null;
  const effortMismatch =
    best && worst && best.brand !== worst.brand && worst.videos >= 3 &&
    best.gmv / best.videos >= (worst.gmv / worst.videos) * 5
      ? { best, worst }
      : null;

  return (
    <div className="space-y-5">
      <SetBreadcrumb label={profile.real_name} />

      {isStale && latestReportDate && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/25 p-4 flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Performance data is {daysStale} days old
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              Last data point:{' '}
              {new Date(latestReportDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
              Period figures below may read low until a fresh upload lands. Lifetime figures are unaffected.
            </p>
          </div>
        </div>
      )}

      {/* ── Identity + contract, one row ─────────────────────────────────── */}
      <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
        <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}66)` }} />
        <div className="px-5 py-4 flex flex-col lg:flex-row lg:items-start gap-4">
          <div className="flex items-start gap-3.5 flex-1 min-w-0">
            <CreatorAvatar name={profile.real_name} color={accent} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-extrabold text-foreground leading-tight">{profile.real_name}</h1>
                {profile.status && (
                  <span className={cn(
                    'text-[11px] px-2 py-0.5 rounded-md font-semibold border capitalize',
                    {
                      active:  'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25',
                      churned: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/25',
                      paused:  'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25',
                    }[profile.status.toLowerCase()] ?? 'bg-muted text-muted-foreground border-border'
                  )}>
                    {profile.status}
                  </span>
                )}
                <span
                  className="text-[11px] px-2 py-0.5 rounded-md font-semibold border"
                  style={{
                    borderColor: `${perfStatusInfo.color}59`,
                    color: perfStatusInfo.color,
                    backgroundColor: `${perfStatusInfo.color}1F`,
                  }}
                >
                  {perfStatusInfo.label}
                </span>
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
                    /*
                     * Role and status live on creator_brands, ONE ROW PER BRAND,
                     * so the edit has to name which brand it means. Without this
                     * the save was applied to every brand the creator works.
                     *
                     * The brand the user is looking at wins; otherwise the
                     * contract brand, which is what the panel is populated from.
                     */
                    brandId: editBrandId,
                    brandLabel: editBrandSlug ? brandLabel(reg, editBrandSlug) : null,
                  }}
                />
                <a
                  href={`/api/admin/view-as-creator?creatorId=${profile.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open this creator's portal (signed in as them) in a new tab"
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" /> Portal
                </a>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs">
                {profile.accounts.slice(0, 4).map((a) => (
                  <a
                    key={a.tiktok_username}
                    href={`https://tiktok.com/@${a.tiktok_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[var(--primary)] hover:underline font-medium"
                  >
                    @{a.tiktok_username}
                    <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                  </a>
                ))}
                {profile.accounts.length > 4 && (
                  <span className="text-muted-foreground">+{profile.accounts.length - 4} more</span>
                )}
                <span className="text-muted-foreground">
                  {profile.accounts.length} account{profile.accounts.length === 1 ? '' : 's'} ·{' '}
                  {activeBrands.length} brand{activeBrands.length === 1 ? '' : 's'}
                </span>
                {profile.email && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Mail className="h-3 w-3" /> {profile.email}
                  </span>
                )}
                {profile.phone && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Phone className="h-3 w-3" /> {profile.phone}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Contract — primary, with the rest summarised. The roster stores one
              row per creator PER BRAND, so a creator routinely holds several
              and the page this replaces silently showed only the first. */}
          <div className="flex items-start gap-4 lg:flex-shrink-0">
            {contracts.primary && (
              <div className="lg:text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[0.075em] text-muted-foreground">
                  Contract
                </p>
                <p className="text-sm font-bold text-foreground mt-0.5">
                  {brandLabel(reg, contracts.primary.brand)}
                  {canViewCost && contracts.primary.retainer > 0 && (
                    <span className="font-semibold tabular-nums"> · {formatCurrency(contracts.primary.retainer)}/mo</span>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {contracts.primary.monthlyPostRequirement > 0
                    ? `${contracts.primary.monthlyPostRequirement} posts/mo required`
                    : 'No post requirement'}
                  {contracts.others.length > 0 && (
                    <>
                      {' · '}
                      <span title={contracts.others.map((c) => brandLabel(reg, c.brand)).join(', ')}>
                        +{contracts.others.length} more contract{contracts.others.length === 1 ? '' : 's'}
                        {canViewCost && contracts.totalRetainer > contracts.primary.retainer &&
                          ` (${formatCurrency(contracts.totalRetainer)}/mo total)`}
                      </span>
                    </>
                  )}
                </p>
              </div>
            )}
            <Suspense fallback={null}>
              <DateRangePicker staleThrough={staleThrough} />
            </Suspense>
          </div>
        </div>
      </div>

      {activeBrands.length > 1 && (
        <Suspense fallback={null}>
          <BrandFilter brands={activeBrands} brandsWithData={activeBrandsWithData} selectedBrand={selectedBrand} />
        </Suspense>
      )}

      {/* ── The answer line ──────────────────────────────────────────────── */}
      {summary.total_videos > 0 && (
        <div className="rounded-2xl border border-border bg-card shadow-sm px-5 py-4">
          <p className="text-[17px] leading-snug text-foreground text-pretty">
            {profile.real_name.split(' ')[0]} published{' '}
            <b className="font-bold tabular-nums">{formatNumber(summary.total_videos)}</b>{' '}
            post{summary.total_videos === 1 ? '' : 's'} across{' '}
            <b className="font-bold tabular-nums">{effort.filter((b) => b.videos > 0).length}</b>{' '}
            brand{effort.filter((b) => b.videos > 0).length === 1 ? '' : 's'} this period
            {contractBrand && (
              <>
                {' '}—{' '}
                <b className="font-bold tabular-nums">
                  {formatNumber(effort.find((b) => b.brand === contractBrand)?.videos ?? 0)}
                </b>{' '}
                of them to <b className="font-bold">{brandLabel(reg, contractBrand)}</b>, the brand on contract
              </>
            )}
            .
          </p>
        </div>
      )}

      {/* ── Coach band ───────────────────────────────────────────────────── */}
      {contracts.primary && contracts.primary.monthlyPostRequirement > 0 && (
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <QuotaRow
            posted={contractPosts}
            required={contracts.primary.monthlyPostRequirement}
            brandName={brandLabel(reg, contracts.primary.brand)}
            accent={accent}
          />
          {effortMismatch && (
            <div className="border-t border-border px-5 py-3.5">
              <p className="text-sm text-foreground">
                <b className="text-red-700 dark:text-red-400">Effort is going where the return isn&apos;t.</b>{' '}
                <b className="tabular-nums">{formatNumber(effortMismatch.worst.videos)}</b> posts to{' '}
                <b>{brandLabel(reg, effortMismatch.worst.brand)}</b> returned{' '}
                <b className="tabular-nums">{formatCurrency(effortMismatch.worst.gmv)}</b> —{' '}
                <b className="tabular-nums">
                  {formatCurrency(effortMismatch.worst.gmv / effortMismatch.worst.videos)}
                </b>{' '}
                a post. The <b className="tabular-nums">{formatNumber(effortMismatch.best.videos)}</b> to{' '}
                <b>{brandLabel(reg, effortMismatch.best.brand)}</b> returned{' '}
                <b className="tabular-nums">
                  {formatCurrency(effortMismatch.best.gmv / effortMismatch.best.videos)}
                </b>{' '}
                a post.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Metric rail ──────────────────────────────────────────────────── */}
      <MetricRail
        cells={[
          { label: 'GMV', value: formatCurrency(summary.total_gmv), delta: pct(summary.total_gmv, summary.prev_gmv) },
          { label: 'Posts published', value: formatNumber(summary.total_videos), delta: pct(summary.total_videos, summary.prev_videos) },
          { label: 'Views', value: engagement ? compact(engagement.views) : '—' },
          { label: 'Engagement', value: engagementRate != null ? `${engagementRate.toFixed(2)}%` : '—',
            foot: engagement ? `${compact(engagement.likes)} likes` : undefined },
          { label: 'GMV / post', value: gmvPerPost != null ? formatCurrency(gmvPerPost) : '—' },
          contractRoi != null && canViewCost
            ? { label: 'Contract ROI', value: `${contractRoi.toFixed(1)}×`,
                foot: `${brandLabel(reg, contractBrand!)} GMV / retainer` }
            : { label: 'Orders', value: formatNumber(summary.total_orders), delta: pct(summary.total_orders, summary.prev_orders) },
        ]}
      />

      {/* ── Where the effort goes ────────────────────────────────────────── */}
      {effort.length > 0 && (
        <Card>
          <CardHeader
            title="Where the effort goes"
            subtitle="Posts published and what they returned, by brand · selected period"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60">
                  <Th>Brand</Th>
                  <Th right>Posts</Th>
                  <Th right>GMV</Th>
                  <Th right>GMV / post</Th>
                  <Th right>Orders</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {effort.map((b) => {
                  const perPost = b.videos > 0 ? b.gmv / b.videos : null;
                  const isContract = b.brand === contractBrand;
                  return (
                    <tr key={b.brand} className="hover:bg-muted/60 transition-colors">
                      <td className="px-5 py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: brandColor(reg, b.brand) }} />
                          <span className="font-medium text-foreground">{brandLabel(reg, b.brand)}</span>
                          {isContract && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-[var(--primary)]">
                              CONTRACT
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">{formatNumber(b.videos)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-foreground">{formatCurrency(b.gmv)}</td>
                      {/* An em dash, not $0 — a brand with sales but no posts this
                          period earned them from posts published earlier, and a
                          per-post figure for zero posts is a division by zero. */}
                      <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-foreground">
                        {perPost != null ? formatCurrency(perPost) : '—'}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">{formatNumber(b.orders)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-2.5 border-t border-border bg-muted/30 text-[11px] text-muted-foreground">
            A brand can show 0 posts and still have GMV — those sales came from posts published before this period.
          </p>
        </Card>
      )}

      {/* ── Content that worked ──────────────────────────────────────────── */}
      {topContent.length > 0 && (
        <Card>
          <CardHeader
            title="Content that worked"
            subtitle="Ranked by views, not GMV — the hook that landed is the thing worth repeating"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60">
                  <Th>Post</Th>
                  <Th>Brand</Th>
                  <Th right>Views</Th>
                  <Th right>Likes</Th>
                  <Th right>GMV</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {topContent.map((v) => (
                  <tr key={v.videoId} className="hover:bg-muted/60 transition-colors">
                    <td className="px-5 py-2.5 min-w-[220px] max-w-[420px]">
                      <span className="font-medium text-foreground truncate block" title={v.title}>{v.title}</span>
                      {v.postDate && (
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(v.postDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2.5">
                      {v.brand ? (
                        <span
                          className="text-xs px-2 py-0.5 rounded-md font-medium"
                          style={{ backgroundColor: `${brandColor(reg, v.brand)}18`, color: brandColor(reg, v.brand) }}
                        >
                          {brandLabel(reg, v.brand)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-foreground">{compact(v.views)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">{compact(v.likes)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">{formatCurrency(v.gmv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Accounts + top sellers ───────────────────────────────────────── */}
      {accountBreakdown.length > 1 && (
        <Card>
          <CardHeader title="Accounts" subtitle="Performance by TikTok account · selected period" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60">
                  <Th>Account</Th>
                  <Th right>Posts</Th>
                  <Th right>GMV</Th>
                  <Th right>Orders</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {accountBreakdown.map((a) => (
                  <tr key={a.tiktok_username} className="hover:bg-muted/60 transition-colors">
                    <td className="px-5 py-2.5">
                      <a
                        href={`https://tiktok.com/@${a.tiktok_username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--primary)] hover:underline font-medium"
                      >
                        @{a.tiktok_username}
                      </a>
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">{formatNumber(a.videos)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-foreground">{formatCurrency(a.gmv)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">{formatNumber(a.orders)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {videos.length > 0 && (
        <Card>
          <CardHeader
            title="Top sellers"
            subtitle={`Highest-grossing posts${selectedBrand ? ` · ${brandLabel(reg, selectedBrand)}` : ''}${summary.total_videos > 20 ? ` · top 20 of ${formatNumber(summary.total_videos)}` : ''}`}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60">
                  <Th>Post</Th>
                  <Th>Account</Th>
                  <Th>Brand</Th>
                  <Th right>GMV</Th>
                  <Th right>Orders</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {videos.map((v) => (
                  <tr key={v.video_id} className="hover:bg-muted/60 transition-colors">
                    <td className="px-5 py-2.5 min-w-[200px] max-w-[380px]">
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
                        className="text-left font-medium text-foreground hover:text-[var(--primary)] hover:underline transition-colors truncate block w-full"
                      >
                        {v.video_title}
                      </VideoTitleButton>
                    </td>
                    <td className="px-5 py-2.5 text-muted-foreground text-xs">@{v.creator_name}</td>
                    <td className="px-5 py-2.5">
                      <span
                        className="text-xs px-2 py-0.5 rounded-md font-medium"
                        style={{ backgroundColor: `${brandColor(reg, v.brand)}18`, color: brandColor(reg, v.brand) }}
                      >
                        {brandLabel(reg, v.brand)}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-foreground">{formatCurrency(v.gmv)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">{formatNumber(v.orders)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Lifetime ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card shadow-sm px-5 py-3.5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.075em] text-muted-foreground">
          All time
        </span>
        <span className="text-sm text-foreground">
          <b className="font-bold tabular-nums">{formatCurrency(lifetimeStats.total_gmv)}</b>
          <span className="text-muted-foreground"> GMV</span>
        </span>
        <span className="text-sm text-foreground">
          <b className="font-bold tabular-nums">{formatNumber(lifetimeStats.total_videos)}</b>
          <span className="text-muted-foreground"> posts</span>
        </span>
        <span className="text-sm text-foreground">
          <b className="font-bold tabular-nums">{formatNumber(lifetimeStats.total_orders)}</b>
          <span className="text-muted-foreground"> orders</span>
        </span>
      </div>

      {/* ── Change history ───────────────────────────────────────────────── */}
      <CreatorChangeHistory
        entries={changeHistory}
        brandLabelFor={(slug) => (slug ? brandLabel(reg, slug) : null)}
        multiBrand={contracts.others.length > 0}
      />
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function pct(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

/** Compact for reach figures: "14.2M" beats "14,245,670" in a metric cell. */
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString('en-US');
}

function CreatorAvatar({ name, color }: { name: string; color: string }) {
  // Only words STARTING with an alphanumeric — skips emoji like 💎
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  return (
    <div
      className="h-12 w-12 rounded-xl flex items-center justify-center text-base font-extrabold text-white shadow-md flex-shrink-0"
      style={{ background: `linear-gradient(135deg, ${color}dd, ${color}88)` }}
    >
      {initials || '?'}
    </div>
  );
}

/**
 * Posts made against the requirement, with day-of-month pace.
 *
 * `posted` counts posts PUBLISHED to the contract brand this month. The page
 * this replaces fed the tracker posts ACTIVE this month, which for Akiek on
 * Dr. Dent was 268 against a 30-post requirement — 893% of quota for a creator
 * who had published 21.
 */
function QuotaRow({
  posted, required, brandName, accent,
}: { posted: number; required: number; brandName: string; accent: string }) {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  // Straight-line expectation. Pure arithmetic on exact inputs — the elapsed
  // fraction of a month times a number the contract states — not a projection.
  const expectedByNow = (required * dayOfMonth) / daysInMonth;
  const onPace = posted >= expectedByNow;
  const shortfall = Math.max(0, Math.ceil(expectedByNow - posted));

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 px-5 py-3.5">
      <div className="min-w-[150px]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.075em] text-muted-foreground">
          {brandName} posts
        </p>
        <p className="text-lg font-extrabold text-foreground tabular-nums mt-0.5">
          {formatNumber(posted)}
          <span className="text-[13px] font-medium text-muted-foreground"> of {formatNumber(required)}</span>
        </p>
      </div>
      <div className="order-last w-full sm:order-none sm:flex-1 sm:w-auto sm:min-w-[140px] h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, (posted / Math.max(required, 1)) * 100)}%`, backgroundColor: accent }}
        />
      </div>
      <div
        className={cn(
          'flex items-center gap-1.5 text-xs flex-shrink-0 font-medium',
          onPace ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400',
        )}
      >
        {onPace ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
        <span className="tabular-nums">
          Day {dayOfMonth}/{daysInMonth} ·{' '}
          {onPace ? 'on pace' : `${formatNumber(shortfall)} behind pace`}
        </span>
      </div>
    </div>
  );
}

function MetricRail({
  cells,
}: {
  cells: { label: string; value: string; delta?: number | null; foot?: string }[];
}) {
  return (
    // Per-cell borders, not `gap-px` over a `bg-border` container: six cells
    // into a 2- or 3-column grid leaves empty slots, and the gap trick paints
    // those solid grey.
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      {cells.map((c) => (
        <div key={c.label} className="border-r border-b border-border px-4 py-3 min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.075em] text-muted-foreground">{c.label}</p>
          <p className="mt-1 text-[21px] font-bold tracking-tight tabular-nums text-foreground leading-tight">{c.value}</p>
          {c.delta != null && Number.isFinite(c.delta) && (
            <p className={cn(
              'mt-0.5 text-xs font-semibold tabular-nums',
              c.delta >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
            )}>
              {c.delta >= 0 ? '▲' : '▼'} {Math.abs(c.delta).toFixed(0)}%
            </p>
          )}
          {c.foot && <p className="mt-0.5 text-[11px] text-muted-foreground truncate">{c.foot}</p>}
        </div>
      ))}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">{children}</div>;
}

function CardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-5 py-3 border-b border-border">
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={cn(
      'px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground',
      right ? 'text-right' : 'text-left',
    )}>
      {children}
    </th>
  );
}
