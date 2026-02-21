'use client';

import { useState } from 'react';
import type { RankingEntry } from '@/lib/data/creator';

function fmt(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

interface Props {
  rankings: RankingEntry[];
  creatorName: string;
}

const MEDALS = ['🥇', '🥈', '🥉'];

export function RankingsClient({ rankings, creatorName }: Props) {
  const [period] = useState('7');

  const myRank = rankings.findIndex((r) => r.creator_name === creatorName) + 1;
  const myEntry = rankings.find((r) => r.creator_name === creatorName);
  const totalCreators = rankings.length;
  const percentile = myRank > 0 ? Math.round(((totalCreators - myRank) / totalCreators) * 100) : 0;

  const top3 = rankings.slice(0, 3);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="animate-fade-in">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#1A1B3A]">🏆 Creator Rankings</h1>
        <p className="text-gray-500 mt-1">See how you stack up against your peers</p>
      </div>

      {/* Your Position */}
      <div className="bg-gradient-to-br from-[#FF4D8D]/5 to-[#7C5CFC]/5 border border-pink-100 rounded-2xl p-6 text-center animate-fade-in">
        <span className="text-xs font-bold uppercase tracking-widest text-[#FF4D8D]">Your Rank</span>
        <p className="text-5xl font-extrabold text-[#1A1B3A] mt-2">
          {myRank > 0 ? `#${myRank}` : '#—'}
        </p>
        <p className="text-sm text-gray-500 mt-1">out of {totalCreators} creators</p>
        {myRank > 0 && (
          <div className="mt-3 inline-block px-3 py-1 rounded-full bg-[#7C5CFC]/10 text-[#7C5CFC] text-sm font-semibold">
            Top {100 - percentile}%
          </div>
        )}
        {myEntry && (
          <p className="text-lg font-bold text-[#34D399] mt-2">{fmt(myEntry.total_gmv)} GMV</p>
        )}
      </div>

      {/* Podium */}
      {top3.length >= 3 && (
        <div className="animate-fade-in">
          <div className="flex items-end justify-center gap-3 sm:gap-6">
            {/* 2nd place */}
            <PodiumCard entry={top3[1]} rank={2} height="h-28" />
            {/* 1st place */}
            <PodiumCard entry={top3[0]} rank={1} height="h-36" highlight />
            {/* 3rd place */}
            <PodiumCard entry={top3[2]} rank={3} height="h-24" />
          </div>
        </div>
      )}

      {/* Full Leaderboard */}
      <div className="animate-fade-in">
        <h3 className="font-semibold text-[#1A1B3A] mb-3">Full Leaderboard</h3>
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="grid grid-cols-[3rem_1fr_auto_auto] gap-4 px-5 py-3 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
            <span>#</span>
            <span>Creator</span>
            <span className="text-right">GMV</span>
            <span className="text-right">Orders</span>
          </div>
          {rankings.map((r, i) => {
            const isMe = r.creator_name === creatorName;
            return (
              <div
                key={r.creator_name}
                className={`grid grid-cols-[3rem_1fr_auto_auto] gap-4 px-5 py-3 items-center text-sm transition-colors ${isMe ? 'bg-pink-50/50 border-l-2 border-[#FF4D8D]' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-pink-50/30`}
              >
                <span className="font-bold text-gray-400">
                  {i < 3 ? MEDALS[i] : `#${i + 1}`}
                </span>
                <span className={`font-medium truncate ${isMe ? 'text-[#FF4D8D]' : 'text-[#1A1B3A]'}`}>
                  {r.creator_name} {isMe && <span className="text-xs text-[#FF4D8D]">(you)</span>}
                </span>
                <span className="text-right font-semibold text-[#34D399]">{fmt(r.total_gmv)}</span>
                <span className="text-right text-gray-500">{r.total_orders}</span>
              </div>
            );
          })}
          {rankings.length === 0 && (
            <div className="text-center py-12 text-gray-400">No ranking data available.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function PodiumCard({ entry, rank, height, highlight }: { entry: RankingEntry; rank: number; height: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col items-center w-28 sm:w-32">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold mb-2 ${highlight ? 'bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] text-white shadow-lg' : 'bg-gray-100 text-gray-600'}`}>
        {MEDALS[rank - 1]}
      </div>
      <p className="text-xs font-semibold text-[#1A1B3A] truncate w-full text-center">{entry.creator_name}</p>
      <p className="text-xs font-bold text-[#34D399]">{fmt(entry.total_gmv)}</p>
      <div className={`w-full ${height} mt-2 rounded-t-xl ${highlight ? 'bg-gradient-to-t from-[#FF4D8D]/20 to-[#FF4D8D]/5' : 'bg-gray-100'}`} />
    </div>
  );
}
