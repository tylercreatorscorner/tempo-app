'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Crown,
  Flame,
  MessageCircle,
  Package,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Video,
} from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DataAvatar } from '@/components/ui/table';
import { Badge, Tag } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Gauge } from '@/components/charts/gauge';
import { fmtCompactCurrency } from '@/components/charts/format';
import type {
  CreatorAction,
  CreatorProductRow,
  CreatorSummary,
  CreatorVideoRow,
  RankChase,
} from '@/lib/data/creator-portal';

// Where "message your manager" points. TODO(owner): replace with the real
// Creator's Corner Discord invite / support channel URL.
const DISCORD_SUPPORT_URL = 'https://discord.com/channels/@me';

// Lifetime-GMV "clubs" — the next one is the affiliate creator's forward target.
const GMV_TIERS = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000];

interface Props {
  realName: string;
  handles: string[];
  currentBrand: string | null;
  currentBrandDisplay: string | null;
  rangeLabel: string;
  summary: CreatorSummary | null;
  lifetimeGmv: number | null;
  retainerTotal: number;
  streak: number;
  monthVideos: number;
  monthlyTarget: number;
  daysLeftInMonth: number;
  topVideos: CreatorVideoRow[];
  topProducts: CreatorProductRow[];
  inspiration: (CreatorVideoRow & { isMine: boolean })[];
  actions: CreatorAction[];
  rankChase: RankChase | null;
  chaseBrandLabel: string | null;
}

export function HomeClient(props: Props) {
  const {
    realName,
    currentBrandDisplay,
    rangeLabel,
    summary,
    lifetimeGmv,
    retainerTotal,
    streak,
    monthVideos,
    monthlyTarget,
    daysLeftInMonth,
    topVideos,
    topProducts,
    inspiration,
    actions,
  } = props;

  // Products the creator actually sells — used to flag "You sell this" on the
  // network-winners list (turns inspiration into a targeted action).
  const sellableProducts = new Set(topProducts.map((p) => p.productName.toLowerCase()));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <PageHeader
        title={
          <>
            {greeting}, <span className="text-pulse-grad">{realName}</span>
          </>
        }
        subtitle={
          currentBrandDisplay ? (
            <>
              Showing <span className="font-semibold text-foreground">{currentBrandDisplay}</span> ·{' '}
              {rangeLabel}
            </>
          ) : (
            <>{rangeLabel} · all brands</>
          )
        }
        actions={<DateRangePicker defaultPreset="last30" />}
      />

      {/* Momentum story — the north-star line, not just a bare number. */}
      <MomentumBand summary={summary} />

      {/* Your next moves — the spine of the hub. */}
      {actions.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Your next moves</h2>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-2.5">
            {actions.map((a, i) => (
              <ActionCard key={a.kind + i} action={a} />
            ))}
          </div>
        </section>
      )}

      {/* Stat grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* summary === null means the read FAILED — show "—", never a fake $0. */}
        <StatCard
          hero
          label="GMV"
          value={summary ? fmtCompactCurrency(summary.totalGmv) : '—'}
          trend={summary?.gmvChangePct ?? undefined}
          trendLabel="vs prior period"
        />
        <StatCard
          label="Orders"
          value={summary ? summary.totalOrders.toLocaleString() : '—'}
          trend={summary?.orderChangePct ?? undefined}
          trendLabel="vs prior period"
        />
        <StatCard
          label="Videos posted"
          value={summary ? String(summary.videoCount) : '—'}
          trend={summary?.videoChangePct ?? undefined}
          trendLabel="vs prior period"
        />
        <StatCard
          label="Day streak"
          value={String(streak)}
          subValue={streak > 0 ? 'Keep it going' : 'Post today to start'}
          accentColor="var(--pulse-warn)"
        />
      </div>

      {/* Earn & pace — retainer quota for contracted creators, a GMV milestone for
          affiliate-only creators (no quota) so everyone gets a forward target. */}
      {monthlyTarget > 0 ? (
        <RetainerPace
          monthVideos={monthVideos}
          monthlyTarget={monthlyTarget}
          daysLeftInMonth={daysLeftInMonth}
          retainerTotal={retainerTotal}
        />
      ) : (
        <MilestoneGoal lifetimeGmv={lifetimeGmv} />
      )}

      {/* Your money-makers — which products convert into the most GMV. */}
      {topProducts.length > 0 && <MoneyMakers products={topProducts} />}

      {/* Two-column: Your top videos + What's winning */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <VideoColumn
          title="Your top videos"
          icon={<Trophy className="h-4 w-4" />}
          videos={topVideos}
          showCooling
          empty={
            <EmptyState
              icon={<Video className="h-8 w-8" />}
              title="Your best work will live here"
              description="No videos in this period yet. Post something today and watch it climb this list."
              action={
                <Link
                  href="/creator-dashboard/discover"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                >
                  Find inspiration <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
              className="border-0 shadow-none"
            />
          }
          ctaHref="/creator-dashboard/stats"
          ctaLabel="See all my stats"
        />
        <VideoColumn
          title="What's winning across the network"
          icon={<Sparkles className="h-4 w-4" />}
          videos={inspiration}
          empty={
            <EmptyState
              icon={<Sparkles className="h-8 w-8" />}
              title="Fresh inspiration incoming"
              description="No standout videos to show right now. Check back soon to see what's taking off across the network."
              className="border-0 shadow-none"
            />
          }
          ctaHref="/creator-dashboard/discover"
          ctaLabel="Browse inspiration"
          showCreator
          sellableProducts={sellableProducts}
        />
      </div>

      {/* Support handoff — reach your manager. */}
      <ManagerHandoff />
    </div>
  );
}

// ---- Momentum ------------------------------------------------------------

function MomentumBand({ summary }: { summary: CreatorSummary | null }) {
  const pct = summary?.gmvChangePct ?? null;
  const up = pct != null && pct >= 5;
  const down = pct != null && pct <= -5;
  const gmv = summary ? fmtCompactCurrency(summary.totalGmv) : null;

  let story: string;
  if (!summary || gmv == null) {
    story = 'Your recent momentum will show here.';
  } else if (up) {
    story = `${gmv} this period, up ${Math.round(pct!)}% vs the prior period.`;
  } else if (down) {
    story = `${gmv} this period, down ${Math.abs(Math.round(pct!))}% vs the prior period.`;
  } else {
    story = `${gmv} this period${pct != null ? ', holding steady' : ''}.`;
  }

  const Icon = up ? TrendingUp : down ? TrendingDown : Sparkles;
  const tone = up ? 'var(--pulse-pos)' : down ? 'var(--pulse-warn)' : 'var(--primary)';

  return (
    <div className="flex items-start gap-2.5">
      <span
        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg"
        style={{ backgroundColor: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <p className="text-base font-semibold text-foreground sm:text-lg">{story}</p>
    </div>
  );
}

// ---- Action stack --------------------------------------------------------

const ACTION_META: Record<
  CreatorAction['kind'],
  { icon: React.ComponentType<{ className?: string }> }
> = {
  no_post: { icon: Video },
  pace_behind: { icon: Target },
  rank_gap: { icon: Crown },
  hot_video: { icon: Flame },
  streak: { icon: Flame },
};

const TONE_STYLE: Record<CreatorAction['tone'], { chip: string; color: string }> = {
  urgent: { chip: 'bg-[var(--pulse-warn)]/12', color: 'var(--pulse-warn)' },
  opportunity: { chip: 'bg-primary/10', color: 'var(--primary)' },
  positive: { chip: 'bg-[var(--pulse-pos)]/12', color: 'var(--pulse-pos)' },
};

/** Subtle neutral card — a small tinted icon carries the tone, not the whole block. */
function ActionCard({ action }: { action: CreatorAction }) {
  const Icon = ACTION_META[action.kind].icon;
  const t = TONE_STYLE[action.tone];
  const external = action.cta?.href.startsWith('http');
  const ctaClass = 'mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline';
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5 shadow-[var(--pulse-elev-1)]">
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${t.chip}`}
        style={{ color: t.color }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{action.headline}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{action.detail}</p>
        {action.cta &&
          (external ? (
            <a href={action.cta.href} target="_blank" rel="noopener noreferrer" className={ctaClass}>
              {action.cta.label} <ArrowRight className="h-3.5 w-3.5" />
            </a>
          ) : (
            <Link href={action.cta.href} className={ctaClass}>
              {action.cta.label} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ))}
      </div>
    </div>
  );
}

// ---- Earn & pace ---------------------------------------------------------

function RetainerPace({
  monthVideos,
  monthlyTarget,
  daysLeftInMonth,
  retainerTotal,
}: {
  monthVideos: number;
  monthlyTarget: number;
  daysLeftInMonth: number;
  retainerTotal: number;
}) {
  const fraction = monthlyTarget > 0 ? monthVideos / monthlyTarget : 0;
  const onTrack = monthVideos >= monthlyTarget;
  const dailyPace = Math.max(
    0,
    Math.ceil(Math.max(0, monthlyTarget - monthVideos) / Math.max(1, daysLeftInMonth)),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-primary">
            <Target className="h-4 w-4" />
          </span>
          Retainer pace
        </CardTitle>
        {onTrack ? (
          <Badge variant="positive" size="sm">Quota met</Badge>
        ) : (
          <Badge variant="neutral" size="sm">This month</Badge>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6 flex-wrap">
          <Gauge
            fraction={fraction}
            size={128}
            label={<NumberTicker value={monthVideos} className="text-foreground" />}
            sublabel={onTrack ? 'quota met ✓' : `of ${monthlyTarget}`}
            color={onTrack ? 'var(--pulse-pos)' : 'var(--primary)'}
          />
          <div className="flex-1 min-w-[220px] space-y-3 text-sm">
            <div className="space-y-2">
              <PaceRow
                label="Videos posted"
                value={`${monthVideos} / ${monthlyTarget}${onTrack ? ' ✓' : ''}`}
              />
              <PaceRow label="Days left" value={String(daysLeftInMonth)} />
              <PaceRow
                label="Status"
                value={onTrack ? 'Quota crushed' : `${dailyPace}/day needed`}
                emphasis
              />
              {retainerTotal > 0 && (
                <PaceRow label="Retainer at stake" value={`${fmtCompactCurrency(retainerTotal)}/mo`} />
              )}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full transition-[width] duration-700"
                style={{
                  width: `${Math.min(100, Math.max(0, fraction * 100))}%`,
                  background: onTrack ? 'var(--pulse-pos)' : 'var(--pulse-grad)',
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {onTrack
                ? "You've hit your posts this month. Every extra video is pure upside."
                : 'Hitting your posts is exactly what your retainer pays for. Stay on pace.'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PaceRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={emphasis ? 'font-bold text-primary' : 'font-semibold text-foreground'}>{value}</span>
    </div>
  );
}

/** Affiliate-only creators (no retainer/quota) get a lifetime-GMV milestone as
 *  their forward target instead of a quota ring. */
function MilestoneGoal({ lifetimeGmv }: { lifetimeGmv: number | null }) {
  if (lifetimeGmv == null || lifetimeGmv <= 0) return null;
  const nextTier = GMV_TIERS.find((t) => t > lifetimeGmv) ?? null;
  const prevTier = [...GMV_TIERS].reverse().find((t) => t <= lifetimeGmv) ?? 0;
  const toGo = nextTier ? nextTier - lifetimeGmv : 0;
  const fraction = nextTier ? (lifetimeGmv - prevTier) / (nextTier - prevTier) : 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-primary">
            <Trophy className="h-4 w-4" />
          </span>
          Next milestone
        </CardTitle>
        <Badge variant="neutral" size="sm">All-time</Badge>
      </CardHeader>
      <CardContent>
        {nextTier ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              You've driven{' '}
              <span className="font-bold text-[var(--pulse-pos)]">{fmtCompactCurrency(lifetimeGmv)}</span>{' '}
              all-time. You're{' '}
              <span className="font-bold text-primary">{fmtCompactCurrency(toGo)}</span> from the{' '}
              <span className="font-bold text-foreground">{fmtCompactCurrency(nextTier)} Club</span>.
            </p>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-pulse-grad transition-[width] duration-700"
                style={{ width: `${Math.min(100, Math.max(2, fraction * 100))}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Every video you post moves this bar. Keep selling to unlock the next club.
            </p>
          </div>
        ) : (
          <p className="text-sm text-foreground">
            {fmtCompactCurrency(lifetimeGmv)} all-time. You've cleared every milestone.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Money-makers --------------------------------------------------------

function MoneyMakers({ products }: { products: CreatorProductRow[] }) {
  const rows = products.slice(0, 5);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-primary">
            <Package className="h-4 w-4" />
          </span>
          Your money-makers
        </CardTitle>
        <Link
          href="/creator-dashboard/stats"
          className="text-xs font-semibold text-primary hover:underline whitespace-nowrap"
        >
          See all →
        </Link>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y divide-border">
          {rows.map((p, i) => (
            <li key={p.productName} className="flex items-center gap-3 py-2.5">
              <DataAvatar>{i + 1}</DataAvatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{p.productName}</p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {p.orders.toLocaleString()} orders
                </p>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-sm font-bold tabular-nums text-[var(--pulse-pos)]">
                  {fmtCompactCurrency(p.gmv)}
                </p>
                {p.gmvChangePct != null && (
                  <p
                    className="whitespace-nowrap text-xs tabular-nums"
                    style={{
                      color: p.gmvChangePct >= 0 ? 'var(--pulse-pos)' : 'var(--pulse-warn)',
                    }}
                  >
                    {p.gmvChangePct >= 0 ? '▲' : '▼'}
                    {Math.abs(Math.round(p.gmvChangePct))}% vs prior
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ---- Video columns -------------------------------------------------------

function VideoColumn({
  title,
  icon,
  videos,
  empty,
  ctaHref,
  ctaLabel,
  showCreator,
  showCooling,
  sellableProducts,
}: {
  title: string;
  icon: React.ReactNode;
  videos: (CreatorVideoRow & { isMine?: boolean })[];
  empty: React.ReactNode;
  ctaHref: string;
  ctaLabel: string;
  showCreator?: boolean;
  showCooling?: boolean;
  sellableProducts?: Set<string>;
}) {
  const rows = videos.slice(0, 5);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          {title}
        </CardTitle>
        <Link href={ctaHref} className="text-xs font-semibold text-primary hover:underline whitespace-nowrap">
          See all →
        </Link>
      </CardHeader>
      <CardContent className="pt-0">
        {rows.length === 0 ? (
          empty
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((v, i) => (
              <VideoRow
                key={v.videoId}
                video={v}
                rank={i + 1}
                showCreator={showCreator}
                cooling={
                  !!showCooling &&
                  v.priorGmv != null &&
                  v.recentGmv != null &&
                  v.priorGmv >= 200 &&
                  v.recentGmv < v.priorGmv * 0.5
                }
                sells={!!sellableProducts?.has((v.topProduct ?? '').toLowerCase())}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function VideoRow({
  video,
  rank,
  showCreator,
  cooling,
  sells,
}: {
  video: CreatorVideoRow & { isMine?: boolean };
  rank: number;
  showCreator?: boolean;
  cooling?: boolean;
  sells?: boolean;
}) {
  const titleNode = video.videoUrl ? (
    <a
      href={video.videoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block truncate font-semibold text-foreground hover:text-primary transition-colors"
    >
      {video.videoTitle}
    </a>
  ) : (
    <span className="block truncate font-semibold text-foreground">{video.videoTitle}</span>
  );

  // Flex row (not a table): the middle column shrinks + truncates via min-w-0,
  // while the stats column is flex-shrink-0 so GMV/orders are ALWAYS visible.
  return (
    <li
      className={
        'flex items-center gap-3 py-2.5' +
        (video.isMine ? ' -mx-2 rounded-lg bg-primary/5 px-2' : '')
      }
    >
      <DataAvatar>{rank}</DataAvatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 truncate">{titleNode}</span>
          {cooling && (
            <span className="flex-shrink-0">
              <Badge variant="warning" size="sm">Cooling</Badge>
            </span>
          )}
          {sells && (
            <span className="flex-shrink-0">
              <Badge variant="positive" size="sm">You sell this</Badge>
            </span>
          )}
          {video.isMine && (
            <span className="flex-shrink-0">
              <Tag>You</Tag>
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {showCreator && <span className="flex-shrink-0">@{video.tiktokUsername}</span>}
          {video.topProduct && (
            <span className="truncate">
              {showCreator ? '· ' : ''}
              {video.topProduct}
            </span>
          )}
        </div>
      </div>
      <div className="flex-shrink-0 text-right">
        <p className="text-sm font-bold tabular-nums text-[var(--pulse-pos)]">{fmtCompactCurrency(video.gmv)}</p>
        <p className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
          {video.orders.toLocaleString()} orders
        </p>
      </div>
    </li>
  );
}

// ---- Support handoff -----------------------------------------------------

function ManagerHandoff() {
  return (
    <a href={DISCORD_SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="block">
      <Card className="p-4 transition-all hover:-translate-y-0.5 hover:shadow-[var(--pulse-elev-2)]">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
            <MessageCircle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground">Questions about your brands or payouts?</p>
            <p className="text-xs text-muted-foreground">Message your Creator's Corner manager on Discord.</p>
          </div>
          <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        </div>
      </Card>
    </a>
  );
}
