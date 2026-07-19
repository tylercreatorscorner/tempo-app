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
  Trophy,
  Video,
} from 'lucide-react';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DataAvatar } from '@/components/ui/table';
import { Badge, Tag } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Gauge } from '@/components/charts/gauge';
import { fmtCompactCurrency } from '@/components/charts/format';
import { Sparkline } from '@/components/creator/sparkline';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { cn } from '@/lib/utils';
import type {
  BrandStanding,
  CreatorAction,
  CreatorDailyPoint,
  CreatorProductRow,
  CreatorSummary,
  CreatorVideoRow,
  UntappedProduct,
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
  dailySeries: CreatorDailyPoint[];
  brandStanding: BrandStanding | null;
  untapped: UntappedProduct | null;
  chaseBrandLabel: string | null;
  /** Streamed network-flex band (async server component behind Suspense). */
  flexSlot?: React.ReactNode;
}

export function HomeClient(props: Props) {
  const {
    realName,
    handles,
    currentBrandDisplay,
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
    dailySeries,
    brandStanding,
    untapped,
    chaseBrandLabel,
    flexSlot,
  } = props;

  // Products the creator actually sells — flags "You sell this" on the network-winners list.
  const sellableProducts = new Set(topProducts.map((p) => p.productName.toLowerCase()));
  const avgPerVideo =
    summary && summary.videoCount > 0 ? summary.totalGmv / summary.videoCount : 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const bandLabel = chaseBrandLabel ?? currentBrandDisplay ?? 'your brand';
  const hasMoneyMakers = topProducts.length > 0 || !!untapped;
  const moneyMakersUp = hasMoneyMakers && !!brandStanding;

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      <LedgerHero
        greeting={greeting}
        realName={realName}
        currentBrandDisplay={currentBrandDisplay}
        summary={summary}
        lifetimeGmv={lifetimeGmv}
        retainerTotal={retainerTotal}
        handleCount={handles.length}
        series={dailySeries}
      />

      <LedgerStrip summary={summary} streak={streak} />

      {/* Network-scale morale beat — streamed so it never blocks Home. */}
      {flexSlot}

      {/* Your next moves — the spine of the hub. */}
      {actions.length > 0 && (
        <section>
          <SectionHead title="Your next moves" />
          <div className="space-y-2.5">
            {actions.map((a, i) => (
              <ActionCard key={a.kind + i} action={a} index={i} />
            ))}
          </div>
        </section>
      )}

      {brandStanding && <BrandStandingBand standing={brandStanding} brandLabel={bandLabel} />}

      {/* Money-makers + rank ladder */}
      {(hasMoneyMakers || brandStanding) && (
        <div className={moneyMakersUp ? 'grid gap-5 lg:grid-cols-2' : ''}>
          {hasMoneyMakers && <MoneyMakers products={topProducts} untapped={untapped} />}
          {brandStanding && (
            <RankLadder standing={brandStanding} brandLabel={bandLabel} avgPerVideo={avgPerVideo} />
          )}
        </div>
      )}

      {/* Earn & pace — retainer quota for contracted, GMV milestone for everyone.
          Contracted creators see both side by side; affiliate-only get the milestone. */}
      {monthlyTarget > 0 ? (
        <div className={lifetimeGmv && lifetimeGmv > 0 ? 'grid gap-5 lg:grid-cols-2' : ''}>
          <RetainerPace
            monthVideos={monthVideos}
            monthlyTarget={monthlyTarget}
            daysLeftInMonth={daysLeftInMonth}
            retainerTotal={retainerTotal}
          />
          {lifetimeGmv != null && lifetimeGmv > 0 && <MilestoneGoal lifetimeGmv={lifetimeGmv} />}
        </div>
      ) : (
        <MilestoneGoal lifetimeGmv={lifetimeGmv} />
      )}

      {/* Two-column: Your top videos + What's winning */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
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

      <ManagerHandoff />
    </div>
  );
}

// ---- Section heading (editorial rule) ------------------------------------

function SectionHead({ title, href, cta }: { title: string; href?: string; cta?: string }) {
  return (
    <div className="mb-3.5 flex items-center gap-3">
      <h2 className="font-ledger text-lg font-semibold text-foreground">{title}</h2>
      <span className="h-px flex-1 bg-border" />
      {href && cta && (
        <Link
          href={href}
          className="whitespace-nowrap text-xs font-semibold text-primary hover:underline"
        >
          {cta}
        </Link>
      )}
    </div>
  );
}

// ---- Hero ----------------------------------------------------------------

function LedgerHero({
  greeting,
  realName,
  currentBrandDisplay,
  summary,
  lifetimeGmv,
  retainerTotal,
  handleCount,
  series,
}: {
  greeting: string;
  realName: string;
  currentBrandDisplay: string | null;
  summary: CreatorSummary | null;
  lifetimeGmv: number | null;
  retainerTotal: number;
  handleCount: number;
  series: CreatorDailyPoint[];
}) {
  const gmvNumber =
    summary != null
      ? Math.round(summary.totalGmv).toLocaleString('en-US')
      : null;
  const pct = summary?.gmvChangePct ?? null;
  const firstName = realName.split(' ')[0] || realName;
  const sparkData = series.map((d) => d.gmv);
  const hasSpark = sparkData.length >= 2 && sparkData.some((v) => v > 0);
  const peak = hasSpark ? Math.max(...sparkData) : 0;

  return (
    <header className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <p className="font-ledger text-2xl font-semibold text-foreground">
          {greeting}, <span className="text-pulse-grad italic">{firstName}</span>.
        </p>
        <DateRangePicker defaultPreset="last30" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
        <div>
          <p className="font-ledger-num text-[clamp(3.25rem,6vw,4.875rem)] font-bold leading-[0.92] tracking-[-0.03em] text-foreground">
            {gmvNumber != null ? (
              <>
                {/* Mockup treatment: half-size, raised, muted currency mark. */}
                <span className="mr-[0.04em] align-[0.34em] text-[0.5em] font-semibold text-muted-foreground">
                  $
                </span>
                {gmvNumber}
              </>
            ) : (
              '—'
            )}
          </p>
          <div className="mt-3.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            {pct != null && <DeltaPill pct={pct} />}
            <p className="text-sm text-muted-foreground">
              GMV this period ·{' '}
              <span className="font-semibold text-foreground">
                {summary ? `${summary.totalOrders.toLocaleString()} orders` : '—'}
              </span>
              {handleCount > 1 ? ` across ${handleCount} handles` : ''}
              {currentBrandDisplay ? '' : ' · all brands'}
            </p>
          </div>
          <p className="mt-3.5 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--pulse-pos)] ring-2 ring-[var(--pulse-pos-bg)]" />
            {retainerTotal > 0 && <>{fmtCompactCurrency(retainerTotal)}/mo retainer secured · </>}
            {lifetimeGmv != null ? (
              <>{fmtCompactCurrency(lifetimeGmv)} driven all-time</>
            ) : (
              <>building your all-time total</>
            )}
          </p>
        </div>

        {hasSpark && (
          <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--pulse-elev-1)]">
            <div className="mb-1 flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <span>Daily GMV</span>
              <span className="text-muted-foreground/60">peak {fmtCompactCurrency(peak)}</span>
            </div>
            <div className="h-[118px] w-full text-primary">
              <Sparkline
                data={sparkData}
                labels={series.map((d) => d.date)}
                className="h-full w-full"
                idKey="hero"
              />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

function DeltaPill({ pct }: { pct: number }) {
  const up = pct >= 0;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-mono text-sm font-semibold tabular-nums"
      style={{
        color: up ? 'var(--pulse-pos)' : 'var(--pulse-neg)',
        backgroundColor: up ? 'var(--pulse-pos-bg)' : 'var(--pulse-neg-bg)',
      }}
    >
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ---- Ledger strip --------------------------------------------------------

function LedgerStrip({ summary, streak }: { summary: CreatorSummary | null; streak: number }) {
  const cells: { k: string; v: string; d: number | null; sub?: string }[] = [
    { k: 'GMV', v: summary ? fmtCompactCurrency(summary.totalGmv) : '—', d: summary?.gmvChangePct ?? null },
    { k: 'Orders', v: summary ? summary.totalOrders.toLocaleString() : '—', d: summary?.orderChangePct ?? null },
    { k: 'Videos posted', v: summary ? String(summary.videoCount) : '—', d: summary?.videoChangePct ?? null },
    {
      k: 'Posting streak',
      v: String(streak),
      d: null,
      sub: streak > 0 ? 'days · keep it going' : 'post today to start',
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-[var(--pulse-elev-1)] sm:grid-cols-4">
      {cells.map((c) => (
        <div key={c.k} className="bg-card p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{c.k}</p>
          <p className="font-ledger-num mt-1.5 text-2xl font-bold text-foreground sm:text-[28px]">{c.v}</p>
          {c.d != null ? (
            <DeltaText pct={c.d} />
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground/70">{c.sub}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function DeltaText({ pct }: { pct: number | null }) {
  if (pct == null) {
    return <p className="mt-1 font-mono text-[11px] text-muted-foreground/50">vs prior</p>;
  }
  const up = pct >= 0;
  return (
    <p
      className="mt-1 font-mono text-[11px] tabular-nums"
      style={{ color: up ? 'var(--pulse-pos)' : 'var(--pulse-neg)' }}
    >
      {up ? '▲' : '▼'} {Math.abs(Math.round(pct))}% vs prior
    </p>
  );
}

// ---- Brand standing band -------------------------------------------------

function BrandStandingBand({ standing, brandLabel }: { standing: BrandStanding; brandLabel: string }) {
  const cells: { k: string; v: string }[] = [
    { k: 'Brand GMV', v: fmtCompactCurrency(standing.brandGmv) },
    { k: 'Orders', v: compactNum(standing.brandOrders) },
    { k: 'Creators', v: compactNum(standing.creatorCount) },
    { k: 'Posts', v: compactNum(standing.postCount) },
  ];
  return (
    <section>
      <SectionHead
        title={`${brandLabel} · where you stand`}
        href="/creator-dashboard/rankings"
        cta="Full rankings →"
      />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-[var(--pulse-elev-1)] sm:grid-cols-5">
        {cells.map((c) => (
          <div key={c.k} className="bg-card p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{c.k}</p>
            <p className="font-ledger-num mt-1.5 text-2xl font-bold text-foreground sm:text-[28px]">{c.v}</p>
          </div>
        ))}
        <div
          className="col-span-2 p-4 sm:col-span-1 sm:p-5"
          style={{ background: 'color-mix(in srgb, var(--primary) 7%, var(--card))' }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Your share</p>
          <p className="text-pulse-grad font-ledger-num mt-1.5 text-2xl font-bold sm:text-[28px]">
            {(standing.myShare * 100).toFixed(1)}%
          </p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground tabular-nums">
            {fmtCompactCurrency(standing.myGmv)} · rank #{standing.myRank} of {standing.creatorCount}
          </p>
        </div>
      </div>
    </section>
  );
}

// ---- Action stack --------------------------------------------------------

const ACTION_META: Record<CreatorAction['kind'], { icon: React.ComponentType<{ className?: string }> }> = {
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

/** Subtle neutral card — a serif index + tinted icon carry the tone, quietly. */
function ActionCard({ action, index }: { action: CreatorAction; index: number }) {
  const Icon = ACTION_META[action.kind].icon;
  const t = TONE_STYLE[action.tone];
  const external = action.cta?.href.startsWith('http');
  const ctaClass = 'mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline';
  return (
    <div className="flex items-start gap-3.5 rounded-xl border border-border bg-card p-3.5 shadow-[var(--pulse-elev-1)] transition-colors hover:border-input">
      <span className="font-ledger-num w-4 pt-0.5 text-center text-[15px] font-bold text-muted-foreground/50">
        {index + 1}
      </span>
      <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', t.chip)} style={{ color: t.color }}>
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

// ---- Money-makers --------------------------------------------------------

function MoneyMakers({
  products,
  untapped,
}: {
  products: CreatorProductRow[];
  untapped?: UntappedProduct | null;
}) {
  const brandMeta = useBrandMeta();
  const rows = products.slice(0, untapped ? 4 : 5);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-ledger text-[15px]">
          <span className="text-primary">
            <Package className="h-4 w-4" />
          </span>
          Your money-makers
        </CardTitle>
        <Link
          href="/creator-dashboard/stats"
          className="whitespace-nowrap text-xs font-semibold text-primary hover:underline"
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
                <p className="text-xs tabular-nums text-muted-foreground">{p.orders.toLocaleString()} orders</p>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-sm font-bold tabular-nums text-[var(--pulse-pos)]">{fmtCompactCurrency(p.gmv)}</p>
                {p.gmvChangePct != null && (
                  <p
                    className="whitespace-nowrap text-xs tabular-nums"
                    style={{ color: p.gmvChangePct >= 0 ? 'var(--pulse-pos)' : 'var(--pulse-warn)' }}
                  >
                    {p.gmvChangePct >= 0 ? '▲' : '▼'}
                    {Math.abs(Math.round(p.gmvChangePct))}% vs prior
                  </p>
                )}
              </div>
            </li>
          ))}
          {untapped && (
            <li className="flex items-center gap-3 py-2.5">
              <DataAvatar color="var(--secondary)" className="text-primary">
                <Sparkles className="h-3.5 w-3.5" />
              </DataAvatar>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-semibold text-foreground">
                  <span className="truncate">{untapped.displayName}</span>
                  <Badge variant="accent" size="sm">
                    Untapped
                  </Badge>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {brandMeta.label(untapped.brandSlug)} · assigned to you, not sold yet
                </p>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-sm font-bold tabular-nums text-muted-foreground">$0</p>
              </div>
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

// ---- Rank ladder ---------------------------------------------------------

function RankLadder({
  standing,
  brandLabel,
  avgPerVideo,
}: {
  standing: BrandStanding;
  brandLabel: string;
  avgPerVideo: number;
}) {
  const { above, below, myRank, myGmv } = standing;
  const gapVideos = above && avgPerVideo > 0 ? Math.max(1, Math.ceil(above.gap / avgPerVideo)) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-ledger text-[15px]">
          <span className="text-primary">
            <Crown className="h-4 w-4" />
          </span>
          {above ? 'Catch the creator above you' : "You're leading the pack"}
        </CardTitle>
        <span className="whitespace-nowrap text-xs text-muted-foreground">{brandLabel}</span>
      </CardHeader>
      <CardContent className="space-y-2">
        {above && <LadderRung pos={myRank - 1} name={above.name} gmv={above.gmv} />}
        <LadderRung pos={myRank} name="You" gmv={myGmv} me />
        {below && <LadderRung pos={myRank + 1} name={below.name} gmv={below.gmv} />}
        {above ? (
          <p className="pt-1.5 text-center text-[13px] text-muted-foreground">
            Close the gap:{' '}
            <span className="font-semibold text-foreground">{fmtCompactCurrency(above.gap)}</span>
            {gapVideos ? (
              <>
                {' '}≈ <span className="font-semibold text-foreground">
                  {gapVideos} video{gapVideos === 1 ? '' : 's'}
                </span>
              </>
            ) : null}{' '}
            passes {above.name} for #{myRank - 1}.
          </p>
        ) : (
          <p className="pt-1.5 text-center text-[13px] text-muted-foreground">
            You&apos;re #{myRank} of {standing.creatorCount} on {brandLabel}. Keep the lead.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function LadderRung({ pos, name, gmv, me }: { pos: number; name: string; gmv: number; me?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border px-3.5 py-2.5',
        me ? 'border-primary bg-primary/5' : 'border-border',
      )}
    >
      <span
        className={cn(
          'font-ledger-num w-9 text-lg font-bold',
          me ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        #{pos}
      </span>
      <span className={cn('flex-1 truncate text-sm font-semibold', me ? 'text-primary' : 'text-foreground')}>
        {name}
      </span>
      <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{fmtCompactCurrency(gmv)}</span>
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
  const dailyPace = Math.max(0, Math.ceil(Math.max(0, monthlyTarget - monthVideos) / Math.max(1, daysLeftInMonth)));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-ledger text-[15px]">
          <span className="text-primary">
            <Target className="h-4 w-4" />
          </span>
          Retainer pace
        </CardTitle>
        {onTrack ? (
          <Badge variant="positive" size="sm">
            Quota met
          </Badge>
        ) : (
          <Badge variant="neutral" size="sm">
            This month
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-6">
          <Gauge
            fraction={fraction}
            size={128}
            label={<NumberTicker value={monthVideos} className="text-foreground" />}
            sublabel={onTrack ? 'quota met ✓' : `of ${monthlyTarget}`}
            color={onTrack ? 'var(--pulse-pos)' : 'var(--primary)'}
          />
          <div className="min-w-[220px] flex-1 space-y-3 text-sm">
            <div className="space-y-2">
              <PaceRow label="Videos posted" value={`${monthVideos} / ${monthlyTarget}${onTrack ? ' ✓' : ''}`} />
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

/** Affiliate-only creators (no retainer/quota) get a lifetime-GMV milestone. */
function MilestoneGoal({ lifetimeGmv }: { lifetimeGmv: number | null }) {
  if (lifetimeGmv == null || lifetimeGmv <= 0) return null;
  const nextTier = GMV_TIERS.find((t) => t > lifetimeGmv) ?? null;
  const prevTier = [...GMV_TIERS].reverse().find((t) => t <= lifetimeGmv) ?? 0;
  const toGo = nextTier ? nextTier - lifetimeGmv : 0;
  const fraction = nextTier ? (lifetimeGmv - prevTier) / (nextTier - prevTier) : 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-ledger text-[15px]">
          <span className="text-primary">
            <Trophy className="h-4 w-4" />
          </span>
          Next milestone
        </CardTitle>
        <Badge variant="neutral" size="sm">
          All-time
        </Badge>
      </CardHeader>
      <CardContent>
        {nextTier ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              You&apos;ve driven{' '}
              <span className="font-bold text-[var(--pulse-pos)]">{fmtCompactCurrency(lifetimeGmv)}</span> all-time.
              You&apos;re <span className="font-bold text-primary">{fmtCompactCurrency(toGo)}</span> from the{' '}
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
            {fmtCompactCurrency(lifetimeGmv)} all-time. You&apos;ve cleared every milestone.
          </p>
        )}
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
        <CardTitle className="flex items-center gap-2 font-ledger text-[15px]">
          <span className="text-primary">{icon}</span>
          {title}
        </CardTitle>
        <Link href={ctaHref} className="whitespace-nowrap text-xs font-semibold text-primary hover:underline">
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
      className="block truncate font-semibold text-foreground transition-colors hover:text-primary"
    >
      {video.videoTitle}
    </a>
  ) : (
    <span className="block truncate font-semibold text-foreground">{video.videoTitle}</span>
  );

  return (
    <li
      className={'flex items-center gap-3 py-2.5' + (video.isMine ? ' -mx-2 rounded-lg bg-primary/5 px-2' : '')}
    >
      <DataAvatar>{rank}</DataAvatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 truncate">{titleNode}</span>
          {cooling && (
            <span className="flex-shrink-0">
              <Badge variant="warning" size="sm">
                Cooling
              </Badge>
            </span>
          )}
          {sells && (
            <span className="flex-shrink-0">
              <Badge variant="positive" size="sm">
                You sell this
              </Badge>
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
        <p className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
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
            <p className="text-xs text-muted-foreground">Message your Creator&apos;s Corner manager on Discord.</p>
          </div>
          <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        </div>
      </Card>
    </a>
  );
}

// ---- utils ---------------------------------------------------------------

function compactNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
