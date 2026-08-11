import { Suspense } from 'react';
import Link from 'next/link';
import { ChevronRight, ExternalLink, MessageCircle, Target, TrendingUp, TrendingDown, Sparkles, Calendar, Flame } from 'lucide-react';
import { requireBrandPortalContext } from '@/lib/data/brand-portal';
import {
  getBrandPortalDashboard,
  type BrandPortalDashboard,
  type BrandPortalPeriod,
} from '@/lib/data/brand-portal-overview';
import { createAdminClient } from '@/lib/supabase/server';
import { resolveWatchUrl } from '@/lib/utils/format';
import {
  getBrandBillingMonth,
  type BrandBillingMonth,
} from '@/lib/data/brand-portal-billing';
import { GmvComparisonChart } from '@/components/charts/gmv-comparison-chart';
import { PeriodTabs } from './period-tabs';
import { onColor } from '@/lib/utils/brand-color';

export const dynamic = 'force-dynamic';

const TOP_CREATORS_PREVIEW = 8;
const TOP_VIDEOS_PREVIEW = 8;

// Shared between each pane's header row and its body rows — that is the only
// thing keeping the two aligned, so they must stay one constant.
// The 5rem posts column is measured, not guessed: "POSTS WITH" renders at
// 74.2px in the header's 10.5px/0.075em uppercase, so 4.5rem (72px) broke it
// onto three lines by two pixels. 80px holds it at two.
const CREATOR_COLS = 'grid grid-cols-[1.25rem_1fr_5rem_5rem_1rem] gap-x-3';
const VIDEO_COLS = 'grid grid-cols-[1fr_3.5rem_5rem_1rem] gap-x-3';

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

      {/* ── The answer line ───────────────────────────────────────────────
          A brand's first question is "what did you actually do for me", and
          the page used to make them assemble it from three cards and a split
          panel. Say it. */}
      {data.split.totalGmv > 0 && (
        <AnswerLine split={data.split} changePct={data.gmvChangePct} accent={accent} />
      )}

      {/* ── Metric rail ───────────────────────────────────────────────────
          Replaces three oversized KPI cards AND the separate engagement
          strip. Same figures, a quarter of the vertical space, and directly
          comparable because they finally share a baseline. Views and
          engagement belong beside GMV, not in their own section a scroll
          away — a brand reads them as one story. */}
      <MetricRail data={data} />

      {/* ── Monthly goal ──────────────────────────────────────────────────
          A slim band, not the half-width card this was. The card carried one
          bar and one sentence in the vertical space of six metric cells, and
          it sat between the reader and the chart. */}
      {data.goalProgress && <GoalBand goal={data.goalProgress} accent={accent} />}

      {/* ── Trend, with the split attached ────────────────────────────────
          The chart used to sit four sections down, below the goal card, the
          split panel and the highlights. It is the thing a brand scrolls
          looking for, so it comes first.

          The roster-vs-organic split rides in the footer instead of getting
          its own half-width card. As a card it restated the answer line at
          the top of the page in a second visual language; as a footer it
          does the one job the answer line can't — the organic side, with its
          post counts, against the same trend the chart just drew. */}
      {(data.dailyPerformance.length > 1 || data.split.totalGmv > 0) && (
        <Card>
          <CardHeader title="Daily GMV" subtitle={`Compared to ${priorLabel(period)}`} />
          {data.dailyPerformance.length > 1 && (
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
          )}
          {data.split.totalGmv > 0 && (
            <ShareBar split={data.split} accent={accent} />
          )}
        </Card>
      )}

      {/* Highlights — "what changed" callouts */}
      {(data.highlights.peakDay ||
        data.highlights.topCreator ||
        data.highlights.topViralPost) && (
        <HighlightsCard highlights={data.highlights} accent={accent} period={period} />
      )}

      {/* ── Billing · monthly basis ────────────────────────────────────────
          Everything above responds to the period tabs. This does NOT, and the
          rule says so out loud: retainers and fees are billed monthly, so
          slicing them into a 7-day window would be apportioning. Without the
          visual break a client reads the ratio as belonging to the selected
          week, which is exactly the misreading that would force an estimate. */}
      <BillingBand billing={billing} />

      {/* ── Detail panes ──────────────────────────────────────────────────
          Table-first, not stacked two-line rows. The old shape spent one line
          per row on a subtitle ("3 posts · Real Name") and still couldn't put
          two rows' numbers in the same column, so nothing was comparable down
          the list — which is the whole point of a ranking. Columns instead:
          eight rows now fit in the height five used to take.

          The counted columns are real reads, not decoration. Posts comes off
          videos.video_id and views off get_brand_portal_video_engagement
          (migration 146) — the per-video figures that were printing as zeros
          on this portal until this week. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top creators */}
        <Card>
          <CardHeaderWithLink
            title="Top creators"
            subtitle={`By GMV in ${PERIOD_SHORT[period]}`}
            href={`/brand-dashboard/creators?period=${period}`}
            linkLabel="View all"
          />
          {data.creators.length === 0 ? (
            <EmptyRow text="No managed creators yet." />
          ) : (
            <>
              <div className={`${CREATOR_COLS} px-4 py-1.5 border-b border-border bg-muted/40 text-[10.5px] font-semibold uppercase tracking-[0.075em] text-muted-foreground`}>
                <span />
                <span>Creator</span>
                {/* Same field the rail calls "Posts with sales", so it carries
                    the same name here. Seen live, two of Lemme's top eight show
                    0 against real GMV — earned by posts published before the
                    window — and a column headed just "Posts" makes that read as
                    a bug instead of the truth. */}
                <span className="text-right leading-tight">Posts with sales</span>
                <span className="text-right">GMV</span>
                <span />
              </div>
              <div className="divide-y divide-border/40">
                {data.creators.slice(0, TOP_CREATORS_PREVIEW).map((c, i) => (
                  <Link
                    key={c.managedId}
                    href={`/brand-dashboard/creators/${c.primaryHandle}?period=${period}`}
                    className={`${CREATOR_COLS} items-baseline px-4 py-2 hover:bg-muted/30 transition-colors`}
                  >
                    <span className="text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                    <span className="min-w-0 truncate text-sm" title={c.realName ?? undefined}>
                      <span className="font-medium" style={{ color: 'var(--brand-ink)' }}>
                        @{c.primaryHandle}
                      </span>
                      {c.realName && (
                        <span className="text-muted-foreground text-xs"> · {c.realName}</span>
                      )}
                    </span>
                    <span className="text-right text-sm tabular-nums text-muted-foreground">
                      {fmtNumber(c.posts)}
                    </span>
                    <span className="text-right text-sm font-semibold tabular-nums text-foreground">
                      {fmtCurrency(c.gmv)}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground self-center" />
                  </Link>
                ))}
              </div>
              <p className="px-4 py-2 border-t border-border bg-muted/30 text-[11px] text-muted-foreground">
                A creator can show 0 posts with sales and still have GMV — those
                sales came from posts published before this period.
              </p>
            </>
          )}
        </Card>

        {/* Top posts. Ordering is guaranteed by brand-portal-overview,
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
          {earnedInPeriod.length === 0 ? (
            <EmptyRow text="No posts earned in this period." />
          ) : (
            <>
              <div className={`${VIDEO_COLS} px-4 py-1.5 border-b border-border bg-muted/40 text-[10.5px] font-semibold uppercase tracking-[0.075em] text-muted-foreground`}>
                <span>Post</span>
                <span className="text-right">Views</span>
                <span className="text-right">GMV</span>
                <span />
              </div>
              <div className="divide-y divide-border/40">
                {earnedInPeriod.slice(0, TOP_VIDEOS_PREVIEW).map((v) => (
                  <a
                    key={v.videoId}
                    // resolveWatchUrl, not `v.url ?? …`: v.url comes from
                    // daily_video_product_stats.video_url, which is an expiring
                    // signed CDN MEDIA link on 98% of rows — a plain ?? lets the
                    // dead link win over the permanent derived permalink.
                    href={resolveWatchUrl(v.url, v.creatorHandle, v.videoId) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${VIDEO_COLS} items-baseline px-4 py-2 hover:bg-muted/30 transition-colors`}
                  >
                    <span className="min-w-0 truncate text-sm" title={v.title}>
                      <span className="font-medium text-foreground">{v.title}</span>
                      <span className="text-muted-foreground text-xs">
                        {' '}· @{v.creatorHandle}
                        {v.postDate && ` · ${fmtDate(v.postDate)}`}
                      </span>
                    </span>
                    {/* An em dash, not 0. A zero here would read as "nobody
                        watched it" when the truth is that the export carried no
                        engagement row for that video-day. */}
                    <span className="text-right text-sm tabular-nums text-muted-foreground">
                      {v.impressions > 0 ? fmtCompact(v.impressions) : '—'}
                    </span>
                    <span
                      className="text-right text-sm font-semibold tabular-nums"
                      style={{ color: 'var(--brand-ink)' }}
                    >
                      {fmtCurrency(v.periodGmv)}
                    </span>
                    <ExternalLink className="h-4 w-4 text-muted-foreground self-center" />
                  </a>
                ))}
              </div>
            </>
          )}
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
            <MessageCircle className="h-3.5 w-3.5" style={{ color: 'var(--brand-ink)' }} />
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
//
// One row: what the month has done, the bar, and where it lands. This was a
// half-width card six metric-cells tall carrying exactly those three facts,
// sitting above the chart.
//
// It is MONTH-grain while everything around it answers to the period tabs, so
// the label says "Month to date" and names the day count out loud. Under the
// no-estimates rule the projection is honest arithmetic on exact inputs —
// MTD ÷ days elapsed × days in month — and it is labelled "on pace for",
// never presented as a figure the brand has earned.

function GoalBand({
  goal,
  accent,
}: {
  goal: NonNullable<BrandPortalDashboard['goalProgress']>;
  accent: string;
}) {
  const onPace = goal.projectedPctOfGoal >= 100;
  const pacingDelta = goal.projectedPctOfGoal - 100;
  const clampedPct = Math.min(100, goal.pctOfGoal);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${accent}18` }}
          >
            <Target className="h-3.5 w-3.5" style={{ color: 'var(--brand-ink-18)' }} />
          </div>
          <p className="text-sm text-foreground">
            <span className="text-muted-foreground">Month to date</span>{' '}
            <b className="font-bold tabular-nums">{fmtCurrency(goal.mtdGmv)}</b>
            <span className="text-muted-foreground tabular-nums">
              {' '}of {fmtCurrency(goal.monthlyGoal)} goal
            </span>{' '}
            <b className="font-bold tabular-nums" style={{ color: 'var(--brand-ink)' }}>
              {goal.pctOfGoal.toFixed(0)}%
            </b>
          </p>
        </div>

        <div className="order-last w-full sm:order-none sm:flex-1 sm:w-auto sm:min-w-[140px] h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${clampedPct}%`, backgroundColor: accent }}
          />
        </div>

        <div
          className={`flex items-center gap-1.5 text-xs flex-shrink-0 ${
            onPace ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
          }`}
        >
          {onPace ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          <span className="tabular-nums">
            Day {goal.daysElapsed}/{goal.daysInMonth} · on pace for{' '}
            <span className="font-semibold">{fmtCurrency(goal.projectedEomGmv)}</span> (
            {onPace ? '+' : ''}
            {pacingDelta.toFixed(0)}%)
          </span>
        </div>
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
        <Sparkles className="h-4 w-4" style={{ color: 'var(--brand-ink)' }} />
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
          <Icon className="h-5 w-5" style={{ color: 'var(--brand-ink)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {label}
            </p>
            {pill && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums"
                style={{ backgroundColor: `${accent}14`, color: 'var(--brand-ink-14)' }}
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

// ── Managed vs organic split ──
//
// Rides in the Daily GMV card's footer. It used to be a half-width card with
// its own heading and sub-heading restating what the answer line already says
// in a sentence; what it uniquely knows is the ORGANIC side, so that is what
// survives — the bar, both figures, both post counts, one strip.

function ShareBar({
  split,
  accent,
}: {
  split: BrandPortalDashboard['split'];
  accent: string;
}) {
  const managedPct = split.managedPctOfGmv;
  const organicPct = Math.max(0, 100 - managedPct);
  return (
    <div className="border-t border-border px-4 py-3.5 space-y-2.5">
      <div className="h-2.5 w-full rounded-full overflow-hidden bg-muted">
        <div
          className="h-full transition-all"
          style={{ width: `${managedPct}%`, backgroundColor: accent }}
          title={`Your managed creators: ${managedPct.toFixed(1)}%`}
        />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
        <SplitLegend
          label="Your roster"
          value={split.managedGmv}
          posts={split.managedPosts}
          pct={managedPct}
          dot={accent}
        />
        <SplitLegend
          label="Other creators"
          value={split.organicGmv}
          posts={split.organicPosts}
          pct={organicPct}
          dot="var(--muted-foreground)"
        />
        <p className="text-xs text-muted-foreground tabular-nums ml-auto">
          Brand total{' '}
          <span className="font-semibold text-foreground">{fmtCurrency(split.totalGmv)}</span>
        </p>
      </div>
    </div>
  );
}

function SplitLegend({
  label, value, posts, pct, dot,
}: { label: string; value: number; posts: number; pct: number; dot: string }) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 translate-y-px"
        style={{ backgroundColor: dot }}
      />
      <p className="text-xs text-muted-foreground">
        {label}{' '}
        <span className="font-semibold text-foreground tabular-nums">{fmtCurrency(value)}</span>
        <span className="tabular-nums"> · {pct.toFixed(1)}% · {fmtNumber(posts)} post{posts === 1 ? '' : 's'}</span>
      </p>
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

// ── Answer line + metric rail ──
//
// These two replace what used to be three oversized KPI cards, a separate
// engagement strip, and no statement of the point at all.

/** Signed change, in semantic colour. Deliberately NOT the brand accent:
 *  good-vs-bad is a different job from brand identity, and painting both in
 *  one colour makes neither readable. */
function Delta({ pct }: { pct: number | null | undefined }) {
  if (pct == null || !Number.isFinite(pct)) return null;
  const up = pct >= 0;
  return (
    <span className={`text-xs font-semibold tabular-nums ${up ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

function AnswerLine({
  split, changePct, accent,
}: { split: BrandPortalDashboard['split']; changePct: number | null; accent: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm px-5 py-4 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
      <p className="text-[17px] leading-snug text-foreground text-pretty">
        Your managed roster drove{' '}
        <b className="font-bold tabular-nums">{fmtCurrency(split.managedGmv)}</b> of{' '}
        <b className="font-bold tabular-nums">{fmtCurrency(split.totalGmv)}</b> in TikTok Shop sales
        this period —{' '}
        {/* The one figure that carries the brand's colour, because it is the
            one figure that is about them. readableOn keeps it legible: raw
            brand colours fail AA as text on every brand we have. */}
        <b className="font-bold tabular-nums" style={{ color: 'var(--brand-ink)' }}>
          {split.managedPctOfGmv.toFixed(1)}%
        </b>
        .
      </p>
      <Delta pct={changePct} />
    </div>
  );
}

function MetricRail({ data }: { data: BrandPortalDashboard }) {
  const eng = data.engagement;
  const cells: Array<{ label: string; value: string; foot?: React.ReactNode }> = [
    {
      label: 'Roster GMV',
      value: fmtCurrency(data.totalGmv),
      foot: <Delta pct={data.gmvChangePct} />,
    },
    {
      // "Posts with sales" and "posts published" are DIFFERENT measures from
      // different tables, and the old page called both of them "posts" — which
      // is how a client ends up distrusting the whole page. Name them apart.
      label: 'Posts with sales',
      value: fmtNumber(data.totalPosts),
      foot: <Delta pct={data.postsChangePct} />,
    },
    {
      label: 'Creators live',
      value: fmtNumber(data.managedCount),
      foot: data.monthlyRetainerTotal > 0
        ? <span className="text-[11.5px] text-muted-foreground">{fmtCurrency(data.monthlyRetainerTotal)}/mo retainer</span>
        : undefined,
    },
    ...(eng.posts > 0
      ? [
          {
            label: 'Views',
            // Compact, not fmtNumber: "2,562,728" is nine characters in a cell
            // sized for "$95.9k", and it wraps at the 2-column breakpoint.
            value: fmtCompact(eng.impressions),
            foot: <Delta pct={eng.impressionsChangePct} />,
          },
          {
            label: 'Engagement',
            value: `${eng.engagementRate.toFixed(2)}%`,
            foot: (
              <span className="text-[11.5px] text-muted-foreground tabular-nums">
                {fmtCompact(eng.likes)} likes · {fmtNumber(eng.posts)} posted
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    // Dividers are drawn by each CELL, not by `gap-px` over a `bg-border`
    // container. Five cells into a 2- or 3-column grid always leaves an empty
    // slot, and the gap trick paints that slot solid border-grey — a stray
    // block at every breakpoint except lg. Per-cell borders leave the empty
    // slot as plain card, and `overflow-hidden` clips the outermost ones
    // against the container's own border.
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      {cells.map((c) => (
        <div key={c.label} className="border-r border-b border-border px-4 py-3.5 min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.075em] text-muted-foreground">{c.label}</p>
          <p className="mt-1 text-[22px] font-bold tracking-tight tabular-nums text-foreground leading-tight">{c.value}</p>
          {c.foot && <div className="mt-1 flex items-center gap-1.5">{c.foot}</div>}
        </div>
      ))}
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
