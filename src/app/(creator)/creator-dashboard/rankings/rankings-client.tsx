'use client';

import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import type { RankingEntry } from '@/lib/data/creator-portal';

type RowWithDelta = RankingEntry & { priorRank: number | null };

interface Props {
  currentBrand: string | null;
  currentBrandDisplay: string | null;
  rangeDays: number;
  rankings: RowWithDelta[];
}

const MEDALS = ['🥇', '🥈', '🥉'];

export function RankingsClient({ currentBrand, currentBrandDisplay, rangeDays, rankings }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  const setRange = (n: number) => {
    const next = new URLSearchParams(params?.toString() ?? '');
    next.set('range', String(n));
    router.push(`/creator-dashboard/rankings?${next.toString()}`);
  };

  const myEntries = rankings.filter((r) => r.isMe);
  const myBest = myEntries.length > 0 ? myEntries.reduce((a, b) => (a.rank < b.rank ? a : b)) : null;

  const top3 = rankings.slice(0, 3);
  const totalShown = rankings.length;

  const fade = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, ease: 'easeOut' as const },
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <motion.div {...fade} className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">🏆 Rankings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {currentBrandDisplay ? (
              <>Where you stack up on <span className="font-medium text-foreground">{currentBrandDisplay}</span> · last {rangeDays} days</>
            ) : (
              <>All brands · last {rangeDays} days</>
            )}
          </p>
        </div>
        <RangePicker value={rangeDays} onChange={setRange} />
      </motion.div>

      {!currentBrand && (
        <motion.div {...fade} transition={{ ...fade.transition, delay: 0.05 }} className="rounded-2xl p-4 border border-[var(--pulse-warn)]/20 bg-[var(--pulse-warn-bg)] text-sm text-[var(--pulse-warn)]">
          Pick a brand from the switcher to see brand-specific rankings.
        </motion.div>
      )}

      {/* Your Position */}
      {myBest && (
        <motion.div {...fade} transition={{ ...fade.transition, delay: 0.1 }}>
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 text-center shadow-[var(--pulse-elev-1)]">
            <span className="text-xs font-bold uppercase tracking-widest text-primary">Your rank</span>
            <p className="text-5xl font-extrabold text-pulse-grad mt-2">#{myBest.rank}</p>
            <p className="text-sm text-muted-foreground mt-1">@{myBest.tiktokUsername} · out of {totalShown}+ creators</p>
            <RankDelta currentRank={myBest.rank} priorRank={myBest.priorRank} className="mt-2" />
            <p className="text-lg font-bold text-[var(--pulse-pos)] mt-2">{fmt(myBest.gmv)} GMV</p>
            {myEntries.length > 1 && (
              <p className="text-xs text-muted-foreground mt-2">
                You also have {myEntries.length - 1} other handle{myEntries.length - 1 === 1 ? '' : 's'} in this leaderboard
              </p>
            )}
          </div>
        </motion.div>
      )}

      {/* Podium */}
      {top3.length === 3 && (
        <motion.div {...fade} transition={{ ...fade.transition, delay: 0.15 }}>
          <div className="flex items-end justify-center gap-3 sm:gap-6">
            <PodiumCard entry={top3[1]} rank={2} height="h-28" />
            <PodiumCard entry={top3[0]} rank={1} height="h-36" highlight />
            <PodiumCard entry={top3[2]} rank={3} height="h-24" />
          </div>
        </motion.div>
      )}

      {/* Full Leaderboard */}
      <motion.section {...fade} transition={{ ...fade.transition, delay: 0.2 }} className="bg-card border border-border rounded-2xl shadow-[var(--pulse-elev-1)] overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-foreground text-sm">Leaderboard</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="px-5 py-3 font-medium w-16">Rank</th>
                <th className="px-5 py-3 font-medium">Creator</th>
                <th className="px-5 py-3 font-medium text-right">GMV</th>
                <th className="px-5 py-3 font-medium text-right hidden sm:table-cell">Orders</th>
                <th className="px-5 py-3 font-medium text-right hidden md:table-cell">Videos</th>
                <th className="px-5 py-3 font-medium text-right">Δ</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((r, i) => {
                const isMe = r.isMe;
                return (
                  <tr
                    key={r.tiktokUsername + i}
                    className={`border-b border-border last:border-0 transition-colors ${
                      isMe ? 'bg-primary/5' : i % 2 === 0 ? 'bg-card' : 'bg-secondary/30'
                    } hover:bg-primary/5`}
                  >
                    <td className="px-5 py-3 font-bold text-muted-foreground">
                      {i < 3 ? <span className="text-base">{MEDALS[i]}</span> : `#${r.rank}`}
                    </td>
                    <td className="px-5 py-3">
                      <p className={`font-medium ${isMe ? 'text-primary' : 'text-foreground'} truncate`}>
                        {r.realName ?? `@${r.tiktokUsername}`}
                        {isMe && <span className="text-xs text-primary ml-1">(you)</span>}
                      </p>
                      {r.realName && <p className="text-xs text-muted-foreground">@{r.tiktokUsername}</p>}
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-[var(--pulse-pos)]">{fmt(r.gmv)}</td>
                    <td className="px-5 py-3 text-right text-foreground hidden sm:table-cell">{r.orders.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground hidden md:table-cell">{r.videos}</td>
                    <td className="px-5 py-3 text-right">
                      <RankDelta currentRank={r.rank} priorRank={r.priorRank} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rankings.length === 0 && (
            <p className="text-center py-12 text-muted-foreground text-sm">No ranking data for this period.</p>
          )}
        </div>
      </motion.section>
    </div>
  );
}

function RankDelta({
  currentRank,
  priorRank,
  className,
}: {
  currentRank: number;
  priorRank: number | null;
  className?: string;
}) {
  if (priorRank === null) {
    return <span className={`inline-flex items-center text-xs text-muted-foreground ${className ?? ''}`}>—</span>;
  }
  const diff = priorRank - currentRank; // positive = moved up
  if (diff === 0) {
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs text-muted-foreground ${className ?? ''}`}>
        <Minus className="h-3 w-3" />
      </span>
    );
  }
  if (diff > 0) {
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs font-medium text-[var(--pulse-pos)] ${className ?? ''}`}>
        <ArrowUp className="h-3 w-3" />
        {diff}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium text-[var(--pulse-neg)] ${className ?? ''}`}>
      <ArrowDown className="h-3 w-3" />
      {Math.abs(diff)}
    </span>
  );
}

function PodiumCard({
  entry,
  rank,
  height,
  highlight,
}: {
  entry: RankingEntry;
  rank: number;
  height: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col items-center w-28 sm:w-36">
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center text-lg mb-2 ${
          highlight ? 'bg-pulse-grad text-white shadow-[var(--pulse-elev-2)]' : 'bg-secondary text-muted-foreground'
        }`}
      >
        {MEDALS[rank - 1]}
      </div>
      <p className="text-xs font-semibold text-foreground truncate w-full text-center">
        {entry.realName ?? `@${entry.tiktokUsername}`}
      </p>
      <p className="text-xs font-bold text-[var(--pulse-pos)]">{fmt(entry.gmv)}</p>
      <div
        className={`w-full ${height} mt-2 rounded-t-xl ${
          highlight ? 'bg-gradient-to-t from-primary/30 to-primary/5' : 'bg-secondary'
        }`}
      />
    </div>
  );
}

function RangePicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const opts = [7, 30, 90];
  return (
    <div className="inline-flex bg-secondary rounded-lg p-1 text-sm">
      {opts.map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={`px-3 py-1 rounded-md transition-all ${
            value === n ? 'bg-card text-foreground shadow-[var(--pulse-elev-1)] font-medium' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {n}d
        </button>
      ))}
    </div>
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}
