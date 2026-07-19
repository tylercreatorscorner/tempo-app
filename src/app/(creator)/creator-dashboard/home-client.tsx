'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  BarChart3,
  Lightbulb,
  Search,
  Sparkles,
  Trophy,
  Video,
} from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { RangePicker } from '@/components/creator/range-picker';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DataAvatar } from '@/components/ui/table';
import { Badge, Tag } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Gauge } from '@/components/charts/gauge';
import { fmtCompactCurrency } from '@/components/charts/format';
import type {
  CoachingNudge,
  CreatorSummary,
  CreatorVideoRow,
} from '@/lib/data/creator-portal';

interface Props {
  realName: string;
  handles: string[];
  currentBrand: string | null;
  currentBrandDisplay: string | null;
  rangeDays: number;
  summary: CreatorSummary | null;
  lifetimeGmv: number | null;
  streak: number;
  monthVideos: number;
  monthlyTarget: number;
  daysLeftInMonth: number;
  topVideos: CreatorVideoRow[];
  inspiration: (CreatorVideoRow & { isMine: boolean })[];
  nudge: CoachingNudge | null;
}

export function HomeClient(props: Props) {
  const {
    realName,
    handles,
    currentBrandDisplay,
    rangeDays,
    summary,
    lifetimeGmv,
    streak,
    monthVideos,
    monthlyTarget,
    daysLeftInMonth,
    topVideos,
    inspiration,
    nudge,
  } = props;

  const router = useRouter();
  const params = useSearchParams();
  const setRange = (n: number) => {
    const next = new URLSearchParams(params?.toString() ?? '');
    next.set('range', String(n));
    router.push(`/creator-dashboard?${next.toString()}`);
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <PageHeader
        title={
          <>
            {greeting}, <span className="text-pulse-grad">{realName}</span> 👋
          </>
        }
        subtitle={
          currentBrandDisplay ? (
            <>
              Showing <span className="font-semibold text-foreground">{currentBrandDisplay}</span> · last{' '}
              {rangeDays} days
            </>
          ) : (
            <>Last {rangeDays} days · all brands</>
          )
        }
        actions={<RangePicker value={rangeDays} onChange={setRange} />}
      />

      {/* Handles + lifetime GMV */}
      {(handles.length > 0 || (lifetimeGmv != null && lifetimeGmv > 0)) && (
        <div className="flex flex-wrap items-center gap-2">
          {handles.slice(0, 4).map((h) => (
            <Chip key={h}>@{h}</Chip>
          ))}
          {handles.length > 4 && <Chip>+{handles.length - 4} more</Chip>}
          {/* lifetimeGmv === null means the read FAILED — show nothing, never a fake $0. */}
          {lifetimeGmv != null && lifetimeGmv > 0 && (
            <Badge variant="positive">{fmtCompactCurrency(lifetimeGmv)} driven all-time 🎉</Badge>
          )}
        </div>
      )}

      {/* Coaching nudge */}
      {nudge && <NudgeCard nudge={nudge} />}

      {/* Stat grid — canonical Pulse StatCards so the portal matches the admin. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* summary === null means the read FAILED (a zero-activity creator gets a
            zeros object, not null) — show "—", never a fake $0. */}
        <StatCard
          hero
          label={`GMV · ${rangeDays}d`}
          value={summary ? fmtCompactCurrency(summary.totalGmv) : '—'}
          trend={summary?.gmvChangePct ?? undefined}
          trendLabel={`vs prior ${rangeDays}d`}
        />
        <StatCard
          label="Orders"
          value={summary ? summary.totalOrders.toLocaleString() : '—'}
          trend={summary?.orderChangePct ?? undefined}
          trendLabel={`vs prior ${rangeDays}d`}
        />
        <StatCard
          label="Videos posted"
          value={summary ? String(summary.videoCount) : '—'}
          trend={summary?.videoChangePct ?? undefined}
          trendLabel={`vs prior ${rangeDays}d`}
        />
        <StatCard
          label="Day streak"
          value={String(streak)}
          subValue={streak > 0 ? 'Keep it going 🔥' : 'Post today to start'}
          accentColor="var(--pulse-warn)"
        />
      </div>

      {/* Retainer pace */}
      {monthlyTarget > 0 && (
        <RetainerPace
          monthVideos={monthVideos}
          monthlyTarget={monthlyTarget}
          daysLeftInMonth={daysLeftInMonth}
        />
      )}

      {/* Two-column: Your top videos + What's winning */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <VideoColumn
          title={`Your top videos (${rangeDays}d)`}
          icon={<Trophy className="h-4 w-4" />}
          videos={topVideos}
          empty={
            <EmptyState
              icon={<Video className="h-8 w-8" />}
              title="Your best work will live here"
              description={`No videos in the last ${rangeDays} days yet. Post something today and watch it climb this list.`}
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
        />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <QuickAction
          href="/creator-dashboard/stats"
          icon={<BarChart3 className="h-5 w-5" />}
          label="My performance"
          subtitle="Trends, products, brand split"
        />
        <QuickAction
          href="/creator-dashboard/rankings"
          icon={<Trophy className="h-5 w-5" />}
          label="Rankings"
          subtitle="Where I stack up"
        />
        <QuickAction
          href="/creator-dashboard/discover"
          icon={<Search className="h-5 w-5" />}
          label="Find inspiration"
          subtitle="What's working right now"
        />
      </div>
    </div>
  );
}

// ---- Components ----------------------------------------------------------

function RetainerPace({
  monthVideos,
  monthlyTarget,
  daysLeftInMonth,
}: {
  monthVideos: number;
  monthlyTarget: number;
  daysLeftInMonth: number;
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
        <CardTitle className="flex items-center gap-2">🎯 Retainer pace</CardTitle>
        <Badge variant="neutral" size="sm">This month</Badge>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6 flex-wrap">
          <Gauge
            fraction={fraction}
            size={128}
            label={<NumberTicker value={monthVideos} className="text-foreground" />}
            sublabel={`of ${monthlyTarget}`}
            color={onTrack ? 'var(--pulse-pos)' : 'var(--primary)'}
          />
          <div className="flex-1 min-w-[200px] space-y-3 text-sm">
            <div className="space-y-2">
              <PaceRow label="Videos posted" value={`${monthVideos} / ${monthlyTarget}`} />
              <PaceRow label="Days left" value={String(daysLeftInMonth)} />
              <PaceRow label="Daily pace needed" value={`${dailyPace}/day`} emphasis />
            </div>
            {/* Progress meter (token-based, reads in both themes). */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full transition-[width] duration-700"
                style={{
                  width: `${Math.min(100, Math.max(0, fraction * 100))}%`,
                  background: onTrack ? 'var(--pulse-pos)' : 'var(--pulse-grad)',
                }}
              />
            </div>
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

function NudgeCard({ nudge }: { nudge: CoachingNudge }) {
  return (
    <div className="rounded-xl p-5 border border-primary/20 bg-primary/5 shadow-[var(--pulse-elev-1)]">
      <div className="flex gap-3 items-start">
        <div className="h-9 w-9 rounded-xl bg-pulse-grad flex items-center justify-center text-white flex-shrink-0">
          <Lightbulb className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground">{nudge.headline}</p>
          <p className="text-sm text-muted-foreground mt-1">{nudge.detail}</p>
          {nudge.cta && (
            <Link
              href={nudge.cta.href}
              className="inline-flex items-center gap-1 mt-2 text-sm font-semibold text-primary hover:underline"
            >
              {nudge.cta.label} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function VideoColumn({
  title,
  icon,
  videos,
  empty,
  ctaHref,
  ctaLabel,
  showCreator,
}: {
  title: string;
  icon: React.ReactNode;
  videos: (CreatorVideoRow & { isMine?: boolean })[];
  empty: React.ReactNode;
  ctaHref: string;
  ctaLabel: string;
  showCreator?: boolean;
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
              <VideoRow key={v.videoId} video={v} rank={i + 1} showCreator={showCreator} />
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
}: {
  video: CreatorVideoRow & { isMine?: boolean };
  rank: number;
  showCreator?: boolean;
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

function QuickAction({
  href,
  icon,
  label,
  subtitle,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  subtitle: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="p-4 hover:shadow-[var(--pulse-elev-2)] hover:-translate-y-0.5 transition-all">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center text-primary flex-shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
