'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, ExternalLink, Flame, Video } from 'lucide-react';
import { useState, useMemo } from 'react';
import type { CreatorVideoRow } from '@/lib/data/creator-portal';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge, Tag } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { RangePicker } from '@/components/creator/range-picker';
import { fmtCompactCurrency } from '@/components/charts/format';
import { formatCurrency, formatNumber } from '@/lib/utils/format';

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

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <PageHeader
        eyebrow="Discover"
        title="Inspiration"
        subtitle={
          currentBrandDisplay ? (
            <>
              What&apos;s winning on <b>{currentBrandDisplay}</b> · last {rangeDays} days
            </>
          ) : (
            <>What&apos;s winning across the network · last {rangeDays} days</>
          )
        }
        actions={<RangePicker value={rangeDays} onChange={setRange} />}
      />

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          type="text"
          placeholder="Search by title, @handle, or product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[240px]"
        />
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground select-none">
          <Switch checked={excludeMine} onCheckedChange={setExcludeMine} aria-label="Hide my videos" />
          <span
            onClick={() => setExcludeMine((v) => !v)}
            className="cursor-pointer hover:text-foreground transition-colors"
          >
            Hide my videos
          </span>
        </div>
      </div>

      {!currentBrand && (
        <Card className="p-4 flex items-start gap-3 border-[var(--pulse-warn)]/25 bg-[var(--pulse-warn-bg)] shadow-none">
          <AlertTriangle className="h-4 w-4 text-[var(--pulse-warn)] mt-0.5 shrink-0" />
          <p className="text-sm text-[var(--pulse-warn)]">
            Showing the whole network. Switch to a brand to filter inspiration to that brand&apos;s products.
          </p>
        </Card>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Video className="h-8 w-8" />}
          title="No videos match your filters"
          description="Try widening the range or clearing search — there's plenty winning out there."
          action={
            search ? (
              <button
                onClick={() => setSearch('')}
                className="text-sm font-semibold text-primary hover:underline"
              >
                Clear search
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((v, i) => (
            <VideoCard key={v.videoId} video={v} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function VideoCard({ video, index }: { video: InspirationVideo; index: number }) {
  const isHot = index < 3;
  const card = (
    <Card
      className={`group p-4 h-full transition-all hover:-translate-y-0.5 hover:shadow-[var(--pulse-elev-2)] ${
        video.isMine ? 'border-primary/40 ring-1 ring-primary/20' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
          <Video className="h-4 w-4 text-primary" />
        </div>
        {isHot && (
          <Badge variant="accent" size="sm">
            <Flame className="h-3 w-3" />
            Top {index + 1}
          </Badge>
        )}
        {video.isMine && <Tag>Yours</Tag>}
      </div>
      <p className="text-sm font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors min-h-[2.5rem]">
        {video.videoTitle}
      </p>
      {video.topProduct && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{video.topProduct}</p>
      )}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
        <div>
          <p
            className="text-lg font-extrabold text-[var(--pulse-pos)]"
            title={video.gmv == null ? undefined : formatCurrency(video.gmv)}
          >
            {video.gmv == null ? '—' : fmtCompactCurrency(video.gmv)}
          </p>
          <p className="text-xs text-muted-foreground">
            {video.orders == null ? '—' : `${formatNumber(video.orders)} orders`}
          </p>
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
    </Card>
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
