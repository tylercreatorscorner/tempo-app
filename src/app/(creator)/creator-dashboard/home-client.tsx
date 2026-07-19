'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  Flame,
  Lightbulb,
  Search,
  Sparkles,
  Trophy,
  Video,
} from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
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

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const fade = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, ease: 'easeOut' as const },
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <motion.div {...fade}>
        <div className="flex items-baseline justify-between flex-wrap gap-3">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            {greeting}, <span className="text-pulse-grad">{realName}</span> 👋
          </h1>
          <p className="text-sm text-muted-foreground">
            {currentBrandDisplay ? (
              <>Showing <span className="font-semibold text-foreground">{currentBrandDisplay}</span> · last 30 days</>
            ) : (
              <>Last 30 days · all brands</>
            )}
          </p>
        </div>
        {handles.length > 0 && (
          <p className="text-sm text-muted-foreground mt-1">
            {handles.slice(0, 4).map((h) => `@${h}`).join(' · ')}
            {handles.length > 4 ? ` · +${handles.length - 4}` : ''}
          </p>
        )}
        {lifetimeGmv != null && lifetimeGmv > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-bold tabular-nums text-[var(--pulse-pos)]">{formatMoney(lifetimeGmv)}</span> driven all-time 🎉
          </p>
        )}
      </motion.div>

      {/* Coaching nudge */}
      {nudge && (
        <motion.div {...fade} transition={{ ...fade.transition, delay: 0.05 }}>
          <NudgeCard nudge={nudge} />
        </motion.div>
      )}

      {/* Stat grid — canonical Pulse StatCards so the portal matches the admin. */}
      <motion.div {...fade} transition={{ ...fade.transition, delay: 0.1 }} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* summary === null means the read FAILED (a zero-activity creator gets a
            zeros object, not null) — show "—", never a fake $0. */}
        <StatCard
          hero
          label="GMV · 30d"
          value={summary ? formatMoney(summary.totalGmv) : '—'}
          trend={summary?.gmvChangePct ?? undefined}
          trendLabel="vs prior 30d"
        />
        <StatCard
          label="Orders"
          value={summary ? summary.totalOrders.toLocaleString() : '—'}
          trend={summary?.orderChangePct ?? undefined}
          trendLabel="vs prior 30d"
        />
        <StatCard
          label="Videos posted"
          value={summary ? String(summary.videoCount) : '—'}
          trend={summary?.videoChangePct ?? undefined}
          trendLabel="vs prior 30d"
        />
        <StatCard
          label="Day streak"
          value={String(streak)}
          subValue={streak > 0 ? 'Keep it going 🔥' : 'Post today to start'}
          accentColor="var(--pulse-warn)"
        />
      </motion.div>

      {/* Retainer pace */}
      {monthlyTarget > 0 && (
        <motion.section
          {...fade}
          transition={{ ...fade.transition, delay: 0.15 }}
          className="rounded-2xl border border-border bg-card p-5 shadow-[var(--pulse-elev-1)]"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-foreground flex items-center gap-2">
              🎯 Retainer pace
            </h2>
            <span className="text-xs text-muted-foreground">This month</span>
          </div>
          <div className="flex items-center gap-6 flex-wrap">
            <PaceRing current={monthVideos} target={monthlyTarget} />
            <div className="flex-1 min-w-[200px] space-y-2 text-sm">
              <PaceRow label="Videos posted" value={`${monthVideos} / ${monthlyTarget}`} />
              <PaceRow label="Days left" value={String(daysLeftInMonth)} />
              <PaceRow
                label="Daily pace needed"
                value={`${Math.max(
                  0,
                  Math.ceil(Math.max(0, monthlyTarget - monthVideos) / Math.max(1, daysLeftInMonth))
                )}/day`}
                emphasis
              />
            </div>
          </div>
        </motion.section>
      )}

      {/* Two-column: Your top videos + What's winning */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <VideoColumn
          title="Your top videos (30d)"
          icon={<Trophy className="h-4 w-4" />}
          videos={topVideos}
          emptyText="No videos in the last 30 days. Post something today to see it here."
          ctaHref="/creator-dashboard/stats"
          ctaLabel="See all my stats"
        />
        <VideoColumn
          title="What's winning across the network"
          icon={<Sparkles className="h-4 w-4" />}
          videos={inspiration}
          emptyText="No top videos to show right now."
          ctaHref="/creator-dashboard/discover"
          ctaLabel="Browse inspiration"
          showCreator
        />
      </div>

      {/* Quick actions */}
      <motion.section
        {...fade}
        transition={{ ...fade.transition, delay: 0.25 }}
        className="grid grid-cols-2 sm:grid-cols-3 gap-3"
      >
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
      </motion.section>
    </div>
  );
}

// ---- Components ----------------------------------------------------------

function PaceRing({ current, target }: { current: number; target: number }) {
  const pct = Math.min(1, target > 0 ? current / target : 0);
  const circumference = 2 * Math.PI * 52;
  const offset = circumference * (1 - pct);
  const onTrack = current >= target;

  return (
    <div className="relative w-28 h-28 flex-shrink-0">
      <svg viewBox="0 0 120 120" className="w-full h-full">
        <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r="52"
          fill="none"
          stroke={onTrack ? 'var(--pulse-pos)' : 'url(#paceGrad)'}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
        <defs>
          <linearGradient id="paceGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--pulse-accent-2)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-foreground">{current}</span>
        <span className="text-xs text-muted-foreground">of {target}</span>
      </div>
    </div>
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
    <div className="rounded-2xl p-5 border border-primary/20 bg-primary/5 shadow-[var(--pulse-elev-1)]">
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
  emptyText,
  ctaHref,
  ctaLabel,
  showCreator,
}: {
  title: string;
  icon: React.ReactNode;
  videos: CreatorVideoRow[];
  emptyText: string;
  ctaHref: string;
  ctaLabel: string;
  showCreator?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--pulse-elev-1)]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-foreground flex items-center gap-2 text-sm">
          <span className="text-primary">{icon}</span>
          {title}
        </h3>
        <Link href={ctaHref} className="text-xs font-semibold text-primary hover:underline">
          {ctaLabel} →
        </Link>
      </div>
      {videos.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6">{emptyText}</p>
      ) : (
        <ul className="space-y-2.5">
          {videos.slice(0, 5).map((v) => (
            <li key={v.videoId}>
              <VideoLink video={v} showCreator={showCreator} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function VideoLink({ video, showCreator }: { video: CreatorVideoRow; showCreator?: boolean }) {
  const inner = (
    <div className="flex items-center gap-3 group">
      <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
        <Video className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
          {video.videoTitle}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
          {showCreator && <span>@{video.tiktokUsername}</span>}
          {video.topProduct && <span className="truncate">{showCreator ? '·' : ''} {video.topProduct}</span>}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold tabular-nums text-[var(--pulse-pos)]">{formatMoney(video.gmv)}</p>
        <p className="text-xs text-muted-foreground tabular-nums">{video.orders.toLocaleString()} orders</p>
      </div>
    </div>
  );
  if (video.videoUrl) {
    return (
      <a href={video.videoUrl} target="_blank" rel="noopener noreferrer" className="block">
        {inner}
      </a>
    );
  }
  return inner;
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
    <Link
      href={href}
      className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card shadow-[var(--pulse-elev-1)] hover:shadow-[var(--pulse-elev-2)] hover:-translate-y-0.5 transition-all"
    >
      <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center text-primary flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
      </div>
    </Link>
  );
}

// ---- Helpers -------------------------------------------------------------

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}
