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
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1A1B3A]">🏆 Rankings</h1>
          <p className="text-sm text-gray-500 mt-1">
            {currentBrandDisplay ? (
              <>Where you stack up on <span className="font-medium text-gray-700">{currentBrandDisplay}</span> · last {rangeDays} days</>
            ) : (
              <>All brands · last {rangeDays} days</>
            )}
          </p>
        </div>
        <RangePicker value={rangeDays} onChange={setRange} />
      </motion.div>

      {!currentBrand && (
        <motion.div {...fade} transition={{ ...fade.transition, delay: 0.05 }} className="rounded-2xl p-4 border border-amber-100 bg-amber-50/60 text-sm text-amber-900">
          Pick a brand from the switcher to see brand-specific rankings.
        </motion.div>
      )}

      {/* Your Position */}
      {myBest && (
        <motion.div {...fade} transition={{ ...fade.transition, delay: 0.1 }}>
          <div className="bg-gradient-to-br from-pink-50 via-white to-purple-50 border border-pink-100 rounded-2xl p-6 text-center shadow-sm">
            <span className="text-xs font-bold uppercase tracking-widest text-[#FF4D8D]">Your rank</span>
            <p className="text-5xl font-extrabold text-[#1A1B3A] mt-2">#{myBest.rank}</p>
            <p className="text-sm text-gray-500 mt-1">@{myBest.tiktokUsername} · out of {totalShown}+ creators</p>
            <RankDelta currentRank={myBest.rank} priorRank={myBest.priorRank} className="mt-2" />
            <p className="text-lg font-bold text-[#34D399] mt-2">{fmt(myBest.gmv)} GMV</p>
            {myEntries.length > 1 && (
              <p className="text-xs text-gray-400 mt-2">
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
      <motion.section {...fade} transition={{ ...fade.transition, delay: 0.2 }} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-[#1A1B3A] text-sm">Leaderboard</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-100">
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
                    className={`border-b border-gray-50 last:border-0 transition-colors ${
                      isMe ? 'bg-pink-50/60' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                    } hover:bg-pink-50/40`}
                  >
                    <td className="px-5 py-3 font-bold text-gray-400">
                      {i < 3 ? <span className="text-base">{MEDALS[i]}</span> : `#${r.rank}`}
                    </td>
                    <td className="px-5 py-3">
                      <p className={`font-medium ${isMe ? 'text-[#FF4D8D]' : 'text-[#1A1B3A]'} truncate`}>
                        {r.realName ?? `@${r.tiktokUsername}`}
                        {isMe && <span className="text-xs text-[#FF4D8D] ml-1">(you)</span>}
                      </p>
                      {r.realName && <p className="text-xs text-gray-400">@{r.tiktokUsername}</p>}
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-[#34D399]">{fmt(r.gmv)}</td>
                    <td className="px-5 py-3 text-right text-gray-700 hidden sm:table-cell">{r.orders.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right text-gray-500 hidden md:table-cell">{r.videos}</td>
                    <td className="px-5 py-3 text-right">
                      <RankDelta currentRank={r.rank} priorRank={r.priorRank} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rankings.length === 0 && (
            <p className="text-center py-12 text-gray-400 text-sm">No ranking data for this period.</p>
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
    return <span className={`inline-flex items-center text-xs text-gray-400 ${className ?? ''}`}>—</span>;
  }
  const diff = priorRank - currentRank; // positive = moved up
  if (diff === 0) {
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs text-gray-400 ${className ?? ''}`}>
        <Minus className="h-3 w-3" />
      </span>
    );
  }
  if (diff > 0) {
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs font-medium text-[#10B981] ${className ?? ''}`}>
        <ArrowUp className="h-3 w-3" />
        {diff}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium text-[#EF4444] ${className ?? ''}`}>
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
          highlight ? 'bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] text-white shadow-lg' : 'bg-gray-100 text-gray-600'
        }`}
      >
        {MEDALS[rank - 1]}
      </div>
      <p className="text-xs font-semibold text-[#1A1B3A] truncate w-full text-center">
        {entry.realName ?? `@${entry.tiktokUsername}`}
      </p>
      <p className="text-xs font-bold text-[#34D399]">{fmt(entry.gmv)}</p>
      <div
        className={`w-full ${height} mt-2 rounded-t-xl ${
          highlight ? 'bg-gradient-to-t from-[#FF4D8D]/30 to-[#FF4D8D]/5' : 'bg-gray-100'
        }`}
      />
    </div>
  );
}

function RangePicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const opts = [7, 30, 90];
  return (
    <div className="inline-flex bg-gray-100 rounded-lg p-1 text-sm">
      {opts.map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={`px-3 py-1 rounded-md transition-all ${
            value === n ? 'bg-white text-[#1A1B3A] shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'
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
