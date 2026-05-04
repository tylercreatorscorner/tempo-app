'use client';

import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { ExternalLink, Flame, Sparkles, Video } from 'lucide-react';
import { useState, useMemo } from 'react';
import type { CreatorVideoRow } from '@/lib/data/creator-portal';

type InspirationVideo = CreatorVideoRow & { isMine: boolean };

interface Props {
  currentBrand: string | null;
  currentBrandDisplay: string | null;
  rangeDays: number;
  videos: InspirationVideo[];
}

export function InspirationClient({ currentBrand, currentBrandDisplay, rangeDays, videos }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [excludeMine, setExcludeMine] = useState(false);
  const [search, setSearch] = useState('');

  const setRange = (n: number) => {
    const next = new URLSearchParams(params?.toString() ?? '');
    next.set('range', String(n));
    router.push(`/creator-dashboard/discover?${next.toString()}`);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return videos.filter((v) => {
      if (excludeMine && v.isMine) return false;
      if (!q) return true;
      return (
        v.videoTitle.toLowerCase().includes(q) ||
        v.tiktokUsername.toLowerCase().includes(q) ||
        (v.topProduct ?? '').toLowerCase().includes(q)
      );
    });
  }, [videos, excludeMine, search]);

  const fade = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, ease: 'easeOut' as const },
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <motion.div {...fade} className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1A1B3A] flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-[#FF4D8D]" />
            Inspiration
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {currentBrandDisplay ? (
              <>What's winning on <span className="font-medium text-gray-700">{currentBrandDisplay}</span> · last {rangeDays} days</>
            ) : (
              <>What's winning across the network · last {rangeDays} days</>
            )}
          </p>
        </div>
        <RangePicker value={rangeDays} onChange={setRange} />
      </motion.div>

      {/* Filters */}
      <motion.div {...fade} transition={{ ...fade.transition, delay: 0.05 }} className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search by title, @handle, or product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[240px] px-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-100 focus:border-[#FF4D8D]"
        />
        <label className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={excludeMine}
            onChange={(e) => setExcludeMine(e.target.checked)}
            className="accent-[#FF4D8D]"
          />
          Hide my videos
        </label>
      </motion.div>

      {!currentBrand && (
        <motion.div {...fade} transition={{ ...fade.transition, delay: 0.1 }} className="rounded-2xl p-4 border border-amber-100 bg-amber-50/60 text-sm text-amber-900">
          Showing the whole network. Switch to a brand to filter inspiration to that brand's products.
        </motion.div>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <p className="text-center py-16 text-gray-400 text-sm">No videos match your filters.</p>
      ) : (
        <motion.div {...fade} transition={{ ...fade.transition, delay: 0.15 }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((v, i) => (
            <VideoCard key={v.videoId} video={v} index={i} />
          ))}
        </motion.div>
      )}
    </div>
  );
}

function VideoCard({ video, index }: { video: InspirationVideo; index: number }) {
  const isHot = index < 3;
  const card = (
    <div
      className={`group bg-white rounded-2xl border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all p-4 h-full ${
        video.isMine ? 'border-[#FF4D8D]/40 ring-1 ring-pink-100' : 'border-gray-100'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-pink-50 to-purple-50 flex items-center justify-center flex-shrink-0">
          <Video className="h-4 w-4 text-[#FF4D8D]" />
        </div>
        {isHot && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#FF4D8D] bg-pink-50 px-2 py-0.5 rounded-full">
            <Flame className="h-3 w-3" />
            Top {index + 1}
          </span>
        )}
        {video.isMine && (
          <span className="text-[11px] font-bold uppercase tracking-wider text-white bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] px-2 py-0.5 rounded-full">
            Yours
          </span>
        )}
      </div>
      <p className="text-sm font-semibold text-[#1A1B3A] line-clamp-2 group-hover:text-[#FF4D8D] transition-colors min-h-[2.5rem]">
        {video.videoTitle}
      </p>
      {video.topProduct && (
        <p className="text-xs text-gray-500 mt-1 line-clamp-1">{video.topProduct}</p>
      )}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
        <div>
          <p className="text-lg font-extrabold text-[#34D399]">{fmt(video.gmv)}</p>
          <p className="text-xs text-gray-400">{video.orders.toLocaleString()} orders</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">@{video.tiktokUsername}</p>
          <p className="text-[11px] text-gray-300 mt-0.5">{video.brandSlug}</p>
        </div>
      </div>
      {video.videoUrl && (
        <p className="mt-2 text-xs text-[#FF4D8D] inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          Watch on TikTok <ExternalLink className="h-3 w-3" />
        </p>
      )}
    </div>
  );
  if (video.videoUrl) {
    return (
      <a href={video.videoUrl} target="_blank" rel="noopener noreferrer" className="block">
        {card}
      </a>
    );
  }
  return card;
}

function RangePicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const opts = [7, 14, 30];
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
