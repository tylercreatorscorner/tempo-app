'use client';

import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { ExternalLink, Flame, Sparkles, Video } from 'lucide-react';
import { useState, useMemo } from 'react';
import type { CreatorVideoRow } from '@/lib/data/creator-portal';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

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
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Inspiration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {currentBrandDisplay ? (
              <>What's winning on <span className="font-medium text-foreground">{currentBrandDisplay}</span> · last {rangeDays} days</>
            ) : (
              <>What's winning across the network · last {rangeDays} days</>
            )}
          </p>
        </div>
        <RangePicker value={rangeDays} onChange={setRange} />
      </motion.div>

      {/* Filters */}
      <motion.div {...fade} transition={{ ...fade.transition, delay: 0.05 }} className="flex items-center gap-3 flex-wrap">
        <Input
          type="text"
          placeholder="Search by title, @handle, or product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[240px]"
        />
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground select-none">
          <Switch
            checked={excludeMine}
            onCheckedChange={setExcludeMine}
            aria-label="Hide my videos"
          />
          <span
            onClick={() => setExcludeMine((v) => !v)}
            className="cursor-pointer hover:text-foreground transition-colors"
          >
            Hide my videos
          </span>
        </div>
      </motion.div>

      {!currentBrand && (
        <motion.div {...fade} transition={{ ...fade.transition, delay: 0.1 }} className="rounded-2xl p-4 border border-[var(--pulse-warn)]/25 bg-[var(--pulse-warn-bg)] text-sm text-[var(--pulse-warn)]">
          Showing the whole network. Switch to a brand to filter inspiration to that brand's products.
        </motion.div>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <p className="text-center py-16 text-muted-foreground text-sm">No videos match your filters.</p>
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
      className={`group bg-card rounded-2xl border shadow-[var(--pulse-elev-1)] hover:shadow-[var(--pulse-elev-2)] hover:-translate-y-0.5 transition-all p-4 h-full ${
        video.isMine ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
          <Video className="h-4 w-4 text-primary" />
        </div>
        {isHot && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full">
            <Flame className="h-3 w-3" />
            Top {index + 1}
          </span>
        )}
        {video.isMine && (
          <span className="text-[11px] font-bold uppercase tracking-wider text-white bg-pulse-grad px-2 py-0.5 rounded-full">
            Yours
          </span>
        )}
      </div>
      <p className="text-sm font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors min-h-[2.5rem]">
        {video.videoTitle}
      </p>
      {video.topProduct && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{video.topProduct}</p>
      )}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
        <div>
          <p className="text-lg font-extrabold text-[var(--pulse-pos)]">{fmt(video.gmv)}</p>
          <p className="text-xs text-muted-foreground">{video.orders.toLocaleString()} orders</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">@{video.tiktokUsername}</p>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">{video.brandSlug}</p>
        </div>
      </div>
      {video.videoUrl && (
        <p className="mt-2 text-xs text-primary inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
    <div className="inline-flex bg-secondary border border-border rounded-lg p-1 text-sm">
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
