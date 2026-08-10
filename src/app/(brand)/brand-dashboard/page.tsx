import { Suspense } from 'react';
import Link from 'next/link';
import { ChevronRight, ExternalLink, MessageCircle, Target, TrendingUp, TrendingDown, Eye, Heart, MessageSquare, Activity, Sparkles, Calendar, Flame } from 'lucide-react';
import { requireBrandPortalContext } from '@/lib/data/brand-portal';
import {
  getBrandPortalDashboard,
  type BrandPortalDashboard,
  type BrandPortalPeriod,
} from '@/lib/data/brand-portal-overview';
import { createAdminClient } from '@/lib/supabase/server';
import { resolveWatchUrl } from '@/lib/utils/format';
import { StatCard } from '@/components/dashboard/stat-card';
import {
  getBrandBillingMonth,
  type BrandBillingMonth,
} from '@/lib/data/brand-portal-billing';
import { GmvComparisonChart } from '@/components/charts/gmv-comparison-chart';
import { PeriodTabs } from './period-tabs';
import { readableOn, tintOver, onColor } from '@/lib/utils/brand-color';

export const dynamic = 'force-dynamic';

const TOP_CREATORS_PREVIEW = 5;
const TOP_VIDEOS_PREVIEW = 5;

interface PageProps {
  searchParams: Promise<{ period?: string }>;
}

export default async function BrandOverview({ searchParams }: PageProps) {
  const ctx = await requireBrandPortalContext();
  const params = await searchParams;
  const period: BrandPortalPeriod = (() => {
    switch (params.period) {
      case 'yesterday':
      case '30d':
      case 'this_month':
      case 'last_month':
        return params.period;
      default:
        return '7d';
    }
  })();

  const admin = await createAdminClient();
  const brandUuid = ctx.activeBrand.id;
  const data = await getBrandPortalDashboard(
    admin,
    brandUuid,
    ctx.activeBrand.slug,
    ctx.activeBrand.display_name || ctx.activeBrand.name,
    period,
  );

  // Month-grain, deliberately independent of `period`. See BillingBand.
  // Scoped off ctx.activeBrand.slug, never a query param: invoices are
  // deny-all under RLS and reachable only via the service-role client, so
  // this call site IS the access control.
  const billing = await getBrandBillingMonth(admin, ctx.activeBrand.slug);

  const accent = ctx.activeBrand.color || '#FF4D8D';
  const dailyGmvSparkline = data.dailyPerformance.map((d) => d.gmv);
  const dailyPostsSparkline = data.dailyPerformance.map((d) => d.posts);
  // Posts that actually earned in the selected window. See the Top posts card.
  const earnedInPeriod = data.videos.filter((v) => v.periodGmv > 0);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          {ctx.activeBrand.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ctx.activeBrand.logo_url}
              alt={data.brandName}
              className="h-10 w-10 rounded-xl object-cover flex-shrink-0"
            />
          ) : (
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center text-base font-bold flex-shrink-0"
              style={{ backgroundColor: accent, color: onColor(accent) }}
            >
              {data.brandName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              {data.brandName}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Snapshot · {data.periodLabel}
            </p>
          </div>
        </div>
        <PeriodTabs current={period} accentColor={accent} />
      </div>

      {/* Account-manager note (full-width when present — easier to read) */}
      {data.amNote && <AmNoteCard note={data.amNote} accent={accent} />}

      {/* KPI grid — hero GMV + standard cards.
          Three cards in a two-column grid left "Managed creators" stranded on
          its own row with dead space beside it. The hero spans both columns at
          md instead, so the row reads GMV / then Posts + Creators paired, and
          collapses back to a clean three-across at lg. Spanning the HERO is
          the right one to widen: it is the headline number, and giving it the
          full width at the cramped breakpoint states that hierarchy rather
          than merely filling a hole. */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          className="md:col-span-2 lg:col-span-1"
          label="GMV"
          value={fmtCurrency(data.totalGmv)}
          trend={data.gmvChangePct ?? undefined}
          trendLabel="vs prior period"
          hero
          accentColor={accent}
          sparklineData={dailyGmvSparkline}
        />
        <StatCard
          label="Posts"
          value={fmtNumber(data.totalPosts)}
          trend={data.postsChangePct ?? undefined}
          trendLabel="vs prior period"
          accentColor={accent}
          sparklineData={dailyPostsSparkline}
        />
        <StatCard
          label="Managed creators"
          value={fmtNumber(data.managedCount)}
          subValue={
            data.monthlyRetainerTotal > 0
              ? `${fmtCurrency(data.monthlyRetainerTotal)}/mo retainer`
              : 'Currently active'
          }
          accentColor={accent}
        />
      </div>

      {/* Monthly goal progress + roster-vs-organic split, side-by-side */}
      {(data.goalProgress || data.split.totalGmv > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.goalProgress && (
            <GoalProgressCard goal={data.goalProgress} accent={accent} />
          )}
          {data.split.totalGmv > 0 && (
            <ManagedSplitPanel split={data.split} accent={accent} />
          )}
        </div>
      )}

      {/* Engagement strip — videos posted in this period */}
      {data.engagement.posts > 0 && (
        <EngagementStrip engagement={data.engagement} accent={accent} />
      )}

      {/* Highlights — "what changed" callouts */}
      {(data.highlights.peakDay ||
        data.highlights.topCreator ||
        data.highlights.topViralPost) && (
        <HighlightsCard highlights={data.highlights} accent={accent} period={period} />
      )}

      {/* Daily GMV chart */}
      {data.dailyPerformance.length > 1 && (
        <Card>
          <CardHeader title="Daily GMV" subtitle={`Compared to ${priorLabel(period)}`} />
          <div className="px-2 pb-2">
            <Suspense fallback={<div className="h-[280px]" />}>
              <GmvComparisonChart
                current={data.dailyPerformance.map((d) => ({
                  date: d.date.toISOString().split('T')[0],
                  gmv: d.gmv,
                }))}
                prior={data.priorPoints.map((p) => ({
                  priorDate: p.priorDate.toISOString().split('T')[0],
                  gmv: p.gmv,
                }))}
                color={accent}
              />
            </Suspense>
          </div>
        </Card>
      )}

      {/* ── Billing · monthly basis ────────────────────────────────────────
          Everything above responds to the period tabs. This does NOT, and the
          rule says so out loud: retainers and fees are billed monthly, so
          slicing them into a 7-day window would be apportioning. Without the
          visual break a client reads the ratio as belonging to the selected
          week, which is exactly the misreading that would force an estimate. */}
      <BillingBand billing={billing} />

      {/* Snapshot panes: top creators + recent videos side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top creators (compact) */}
        <Card>
          <CardHeaderWithLink
            title="Top creators"
            subtitle={`By GMV in ${PERIOD_SHORT[period]}`}
            href={`/brand-dashboard/creators?period=${period}`}
            linkLabel="View all"
          />
          <div className="divide-y divide-border/40">
            {data.creators.length === 0 ? (
              <EmptyRow text="No managed creators yet." />
            ) : (
              data.creators.slice(0, TOP_CREATORS_PREVIEW).map((c, i) => (
                <Link
                  key={c.managedId}
                  href={`/brand-dashboard/creators/${c.primaryHandle}?period=${period}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors"
                >
                  <span className="text-xs text-muted-foreground w-5 tabular-nums">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: readableOn(accent) }}
                      title={c.realName ?? undefined}
                    >
                      @{c.primaryHandle}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.posts} post{c.posts === 1 ? '' : 's'}
                      {c.realName ? ` · ${c.realName}` : ''}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {fmtCurrency(c.gmv)}
                  </p>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </Link>
              ))
            )}
          </div>
        </Card>

        {/* Top posts (compact). Ordering is guaranteed by brand-portal-overview,
            NOT by the RPC — see the note there.

            earnedInPeriod, not data.videos: a post with $0 in the window is not
            a "highest-grossing post", and showing one says something false to a
            client. It also keeps cross-brand duplicate rows off this surface —
            99.3% of video_ids that appear under more than one brand carry $0 on
            the duplicate side, which is how a Kitsch post reached Lemme's
            Overview. That duplication is a data-layer problem this filter only
            hides; it is not fixed here. */}
        <Card>
          <CardHeaderWithLink
            title="Top posts"
            subtitle="Highest-grossing posts in this period"
            href={`/brand-dashboard/videos?period=${period}`}
            linkLabel="View all"
          />
          <div className="divide-y divide-border/40">
            {earnedInPeriod.length === 0 ? (
              <EmptyRow text="No posts earned in this period." />
            ) : (
              earnedInPeriod.slice(0, TOP_VIDEOS_PREVIEW).map((v) => (
                <a
                  key={v.videoId}
                  // resolveWatchUrl, not `v.url ?? …`: v.url comes from
                  // daily_video_product_stats.video_url, which is an expiring
                  // signed CDN MEDIA link on 98% of rows — a plain ?? lets the
                  // dead link win over the permanent derived permalink.
                  href={resolveWatchUrl(v.url, v.creatorHandle, v.videoId) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate" title={v.title}>
                      {v.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      @{v.creatorHandle}
                      {v.postDate && (
                        <>
                          <span className="mx-1.5 text-muted-foreground">·</span>
                          {fmtDate(v.postDate)}
                        </>
                      )}
                    </p>
                  </div>
                  <p
                    className="text-sm font-semibold tabular-nums shrink-0"
                    style={{ color: readableOn(accent) }}
                  >
                    {fmtCurrency(v.periodGmv)}
                  </p>
                  <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                </a>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Account-manager note ──

function AmNoteCard({
  note,
  accent,
}: {
  note: NonNullable<BrandPortalDashboard['amNote']>;
  accent: string;
}) {
  const updatedLabel = note.updatedAt
    ? note.updatedAt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;
  return (
    <div
      className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden relative"
      style={{
        background: `linear-gradient(135deg, ${accent}08 0%, var(--card) 60%)`,
      }}
    >
      <div className="p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2.5">
          <div
            className="h-7 w-7 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${accent}18` }}
          >
            <MessageCircle className="h-3.5 w-3.5" style={{ color: readableOn(accent) }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              From your account manager
            </p>
            {note.authorName || updatedLabel ? (
              <p className="text-xs text-muted-foreground truncate">
                {note.authorName ?? 'Your AM'}
                {updatedLabel && (
                  <>
                    <span className="mx-1 text-muted-foreground">·</span>
                    {updatedLabel}
                  </>
                )}
              </p>
            ) : null}
          </div>
        </div>
        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
          {note.text}
        </p>
      </div>
    </div>
  );
}

// ── Goal progress ──

function GoalProgressCard({
  goal,
  accent,
}: {
  goal: NonNullable<BrandPortalDashboard['goalProgress']>;
  accent: string;
}) {
  const onPace = goal.projectedPctOfGoal >= 100;
  const crushing = goal.projectedPctOfGoal >= 120;
  const pacingDelta = goal.projectedPctOfGoal - 100;
  const clampedPct = Math.min(100, goal.pctOfGoal);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className="h-7 w-7 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${accent}18` }}
            >
              <Target className="h-3.5 w-3.5" style={{ color: readableOn(accent) }} />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Monthly GMV goal
              </p>
              <p className="text-xs text-muted-foreground">
                Day {goal.daysElapsed} of {goal.daysInMonth}
              </p>
            </div>
          </div>
          {crushing && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold tabular-nums">
              🎯 Crushing it
            </span>
          )}
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {fmtCurrency(goal.mtdGmv)}
              <span className="text-sm font-medium text-muted-foreground ml-1.5">
                / {fmtCurrency(goal.monthlyGoal)}
              </span>
            </p>
            <p
              className="text-sm font-semibold tabular-nums"
              style={{ color: readableOn(accent) }}
            >
              {goal.pctOfGoal.toFixed(0)}%
            </p>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${clampedPct}%`, backgroundColor: accent }}
            />
          </div>
        </div>

        {/* Pacing callout — celebratory pill when massively over-pacing,
            or muted text when modestly over/under. */}
        {crushing ? (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50/80 px-3 py-2.5">
            <TrendingUp className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            <p className="text-xs text-emerald-800">
              On pace for{' '}
              <span className="font-bold tabular-nums">
                {fmtCurrency(goal.projectedEomGmv)}
              </span>{' '}
              EOM —{' '}
              <span className="font-bold tabular-nums">+{pacingDelta.toFixed(0)}%</span>{' '}
              over goal
            </p>
          </div>
        ) : (
          <div
            className={`flex items-center gap-1.5 text-xs ${
              onPace ? 'text-emerald-600' : 'text-amber-600'
            }`}
          >
            {onPace ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            <span>
              {onPace ? 'On pace for' : 'Pacing toward'}{' '}
              <span className="font-semibold">{fmtCurrency(goal.projectedEomGmv)}</span>{' '}
              EOM ({onPace ? '+' : ''}
              {pacingDelta.toFixed(0)}% {onPace ? 'over' : 'under'} goal)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Highlights ──

function HighlightsCard({
  highlights,
  accent,
  period,
}: {
  highlights: BrandPortalDashboard['highlights'];
  accent: string;
  period: BrandPortalPeriod;
}) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-border/50 flex items-center gap-2">
        <Sparkles className="h-4 w-4" style={{ color: readableOn(accent) }} />
        <h3 className="text-sm font-semibold text-foreground">Highlights this period</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/40">
        {highlights.peakDay && (
          <HighlightItem
            icon={Calendar}
            label="Best day"
            primary={highlights.peakDay.date.toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
            })}
            secondary={`${fmtCurrency(highlights.peakDay.gmv)} in GMV`}
            accent={accent}
          />
        )}
        {highlights.topCreator && (
          <HighlightItem
            icon={TrendingUp}
            label="Top performer"
            primary={`@${highlights.topCreator.handle}`}
            secondary={`${fmtCurrency(highlights.topCreator.gmv)} · ${highlights.topCreator.posts} post${
              highlights.topCreator.posts === 1 ? '' : 's'
            }`}
            accent={accent}
            href={`/brand-dashboard/creators/${highlights.topCreator.handle}?period=${period}`}
          />
        )}
        {highlights.topViralPost && (
          <HighlightItem
            icon={Flame}
            label="Most viral post"
            primary={highlights.topViralPost.title}
            secondary={`${fmtCompact(highlights.topViralPost.impressions)} views · @${highlights.topViralPost.creatorHandle}`}
            pill="↗ TikTok"
            accent={accent}
            href={
              resolveWatchUrl(
                highlights.topViralPost.url,
                highlights.topViralPost.creatorHandle,
                highlights.topViralPost.videoId,
              ) ?? undefined
            }
            external
            truncatePrimary
          />
        )}
      </div>
    </div>
  );
}

function HighlightItem({
  icon: Icon,
  label,
  primary,
  secondary,
  pill,
  accent,
  href,
  external,
  truncatePrimary,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  primary: string;
  secondary: string;
  /** Optional small badge on the right (e.g. "↗ TikTok"). */
  pill?: string;
  accent: string;
  href?: string;
  external?: boolean;
  truncatePrimary?: boolean;
}) {
  const inner = (
    <div className="px-5 py-5 group h-full transition-transform duration-200 hover:-translate-y-0.5">
      <div className="flex items-start gap-3">
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
          style={{ backgroundColor: `${accent}18` }}
        >
          <Icon className="h-5 w-5" style={{ color: readableOn(accent) }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {label}
            </p>
            {pill && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums"
                style={{ backgroundColor: `${accent}14`, color: readableOn(accent, tintOver(accent, "14")) }}
              >
                {pill}
              </span>
            )}
          </div>
          <p
            className={`text-sm font-bold text-foreground ${truncatePrimary ? 'truncate' : ''}`}
            title={truncatePrimary ? primary : undefined}
          >
            {primary}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{secondary}</p>
        </div>
      </div>
    </div>
  );
  if (!href) return inner;
  return external ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block hover:bg-muted/30 transition-colors"
    >
      {inner}
    </a>
  ) : (
    <Link href={href} className="block hover:bg-muted/30 transition-colors">
      {inner}
    </Link>
  );
}

// ── Engagement strip ──

function EngagementStrip({
  engagement,
  accent,
}: {
  engagement: BrandPortalDashboard['engagement'];
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-border/50 flex items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Reach &amp; engagement</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            From {fmtNumber(engagement.posts)} post{engagement.posts === 1 ? '' : 's'} your managed creators published this period
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border/40">
        <EngagementStat
          icon={Eye}
          label="Views"
          value={fmtCompact(engagement.impressions)}
          changePct={engagement.impressionsChangePct}
          accent={accent}
        />
        <EngagementStat
          icon={Heart}
          label="Likes"
          value={fmtCompact(engagement.likes)}
          accent={accent}
        />
        <EngagementStat
          icon={MessageSquare}
          label="Comments"
          value={fmtCompact(engagement.comments)}
          accent={accent}
        />
        <EngagementStat
          icon={Activity}
          label="Engagement"
          value={`${engagement.engagementRate.toFixed(1)}%`}
          changePctPoints={
            engagement.priorEngagementRate > 0
              ? engagement.engagementRate - engagement.priorEngagementRate
              : undefined
          }
          subtitle={
            engagement.priorEngagementRate > 0
              ? `Prior: ${engagement.priorEngagementRate.toFixed(1)}%`
              : 'Likes + comments per view'
          }
          accent={accent}
        />
      </div>
    </div>
  );
}

function EngagementStat({
  icon: Icon,
  label,
  value,
  changePct,
  changePctPoints,
  subtitle,
  accent,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string;
  /** % change (e.g. 12 means +12%). Used for absolute counts like views. */
  changePct?: number | null;
  /** Raw percentage-point change (e.g. +0.2 for 1.7→1.9%). Used for rate metrics. */
  changePctPoints?: number;
  subtitle?: string;
  accent: string;
}) {
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="h-3.5 w-3.5" style={{ color: readableOn(accent) }} />
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
      </div>
      <p className="text-lg font-bold text-foreground tabular-nums">{value}</p>
      {changePct != null && Math.abs(changePct) >= 0.1 ? (
        <p
          className={`text-[11px] mt-0.5 font-medium tabular-nums ${
            changePct > 0 ? 'text-emerald-600' : 'text-rose-600'
          }`}
        >
          {changePct > 0 ? '+' : ''}
          {changePct.toFixed(0)}% vs prior
        </p>
      ) : changePctPoints != null && Math.abs(changePctPoints) >= 0.05 ? (
        <p
          className={`text-[11px] mt-0.5 font-medium tabular-nums ${
            changePctPoints > 0 ? 'text-emerald-600' : 'text-rose-600'
          }`}
        >
          {changePctPoints > 0 ? '+' : ''}
          {changePctPoints.toFixed(1)}pp vs prior
        </p>
      ) : subtitle ? (
        <p className="text-[11px] mt-0.5 text-muted-foreground tabular-nums">{subtitle}</p>
      ) : null}
    </div>
  );
}

// ── Managed vs organic split ──

function ManagedSplitPanel({
  split,
  accent,
}: {
  split: BrandPortalDashboard['split'];
  accent: string;
}) {
  const managedPct = split.managedPctOfGmv;
  const organicPct = Math.max(0, 100 - managedPct);
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-border/50 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-1">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Your roster vs total brand sales
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            How much of your brand&apos;s TikTok Shop GMV your managed creators drove this period
          </p>
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          Total: <span className="font-semibold text-foreground">{fmtCurrency(split.totalGmv)}</span>
        </p>
      </div>

      <div className="px-4 pt-4 pb-5 space-y-4">
        {/* Stacked bar */}
        <div
          className="h-3 w-full rounded-full overflow-hidden flex"
          style={{ backgroundColor: 'var(--muted)' }}
        >
          <div
            className="h-full transition-all"
            style={{
              width: `${managedPct}%`,
              backgroundColor: accent,
            }}
            title={`Your managed creators: ${managedPct.toFixed(1)}%`}
          />
        </div>

        {/* Legend rows */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SplitRow
            label="Your managed creators"
            value={split.managedGmv}
            posts={split.managedPosts}
            pct={managedPct}
            color={accent}
          />
          <SplitRow
            label="Other creators (organic)"
            value={split.organicGmv}
            posts={split.organicPosts}
            pct={organicPct}
            color="var(--muted-foreground)"
            muted
          />
        </div>
      </div>
    </div>
  );
}

function SplitRow({
  label,
  value,
  posts,
  pct,
  color,
  muted = false,
}: {
  label: string;
  value: number;
  posts: number;
  pct: number;
  color: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <div className="flex-1 min-w-0">
        <p className={`text-xs ${muted ? 'text-muted-foreground' : 'text-muted-foreground'}`}>{label}</p>
        <p className="text-sm font-semibold text-foreground tabular-nums">
          {fmtCurrency(value)}
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            · {fmtNumber(posts)} post{posts === 1 ? '' : 's'}
          </span>
        </p>
      </div>
      <span className="text-xs font-semibold tabular-nums" style={{ color: muted ? 'var(--muted-foreground)' : readableOn(color) }}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

// ── Billing · cost vs return (monthly) ──
//
// Brands asked for this: the portal's other ROI figure compares roster GMV to
// RETAINER only, which flatters us. This one is against the whole invoice.
//
// Three things here are deliberate and should survive redesigns:
//   · the heading names its month, because this pane ignores the period tabs;
//   · the ratio is "GMV per $1 of fees", never "ROI" — GMV is not profit and
//     the brand does not keep it, and the caption says so before their finance
//     team has to point it out;
//   · a month with no closed invoice renders an em dash, never $0. Zero cost
//     reads as free and makes the ratio infinite.
function BillingBand({ billing }: { billing: BrandBillingMonth | null }) {
  if (!billing) return null;

  const lines: { label: string; value: number }[] = [
    { label: 'Creator retainers', value: billing.retainer },
    { label: 'Rev-share commission', value: billing.commission },
    { label: 'Product retainers', value: billing.productRetainer },
    { label: 'Launch fees', value: billing.launchFee },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Billing · monthly basis
        </span>
        <span className="flex-1 h-px bg-border" aria-hidden="true" />
      </div>

      <Card>
        <CardHeader
          title={`What you spent, and what it returned — ${billing.monthLabel}`}
          subtitle={
            billing.monthsStale >= 2
              ? `Your most recent closed invoice. Nothing has been invoiced in the ${billing.monthsStale} months since.`
              : 'Last closed month. Not the period selected above.'
          }
        />
        <div className="grid grid-cols-1 lg:grid-cols-2">
          <div className="p-5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              GMV per $1 of fees
            </div>
            <div className="mt-2 text-4xl font-bold tracking-tight tabular-nums text-foreground">
              {billing.gmvPerDollar === null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                `$${billing.gmvPerDollar.toFixed(2)}`
              )}
            </div>
            <p className="mt-2.5 text-sm text-muted-foreground">
              Your roster produced{' '}
              <span className="font-semibold text-foreground tabular-nums">
                {fmtCurrency(billing.gmv)}
              </span>{' '}
              in GMV against{' '}
              <span className="font-semibold text-foreground tabular-nums">
                {fmtCurrency(billing.total)}
              </span>{' '}
              in total fees.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              This is GMV, not profit. It is what your creators sold before
              TikTok&apos;s cut, product cost and returns — not money in your
              account.
            </p>
          </div>

          <div className="p-5 border-t border-border lg:border-t-0 lg:border-l">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
              What you were billed
            </div>
            <table className="w-full">
              <tbody>
                {lines.map((l) => (
                  <tr key={l.label}>
                    <td
                      className={`py-1.5 text-sm ${
                        l.value === 0 ? 'text-muted-foreground' : 'text-foreground'
                      }`}
                    >
                      {l.label}
                    </td>
                    <td
                      className={`py-1.5 text-sm text-right tabular-nums ${
                        l.value === 0 ? 'text-muted-foreground' : 'text-foreground'
                      }`}
                    >
                      {fmtCurrency(l.value)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="pt-2.5 border-t border-border text-sm font-semibold text-foreground">
                    Total
                  </td>
                  <td className="pt-2.5 border-t border-border text-sm font-semibold text-right tabular-nums text-foreground">
                    {fmtCurrency(billing.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <p className="px-5 py-2.5 border-t border-border bg-muted/30 text-xs text-muted-foreground">
          Taken straight from your invoices
          {billing.invoiceCount > 1 && `, summed across all ${billing.invoiceCount} for the month`}.
          A month shows &ldquo;—&rdquo; until its invoicing closes; it is never shown as $0.
          {billing.gmvAmbiguous &&
            ' Invoices for this month recorded slightly different GMV totals; the most complete figure is shown.'}
        </p>
      </Card>
    </div>
  );
}

// ── Subcomponents ──

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {children}
    </div>
  );
}

function CardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-4 pt-4 pb-3 border-b border-border/50">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

function CardHeaderWithLink({
  title,
  subtitle,
  href,
  linkLabel,
}: {
  title: string;
  subtitle?: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="px-4 pt-4 pb-3 border-b border-border/50 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <Link
        href={href}
        className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-0.5 shrink-0"
      >
        {linkLabel}
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground px-4 py-8 text-center">{text}</p>;
}

// ── Helpers ──

const PERIOD_SHORT: Record<BrandPortalPeriod, string> = {
  yesterday: 'yesterday',
  '7d': 'last 7 days',
  '30d': 'last 30 days',
  this_month: 'this month',
  last_month: 'last month',
};

function priorLabel(period: BrandPortalPeriod): string {
  switch (period) {
    case 'yesterday':
      return 'the day before';
    case '7d':
      return 'the prior 7 days';
    case '30d':
      return 'the prior 30 days';
    case 'this_month':
      return 'last month (same days)';
    case 'last_month':
      return 'two months ago';
  }
}

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function fmtNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString('en-US');
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
