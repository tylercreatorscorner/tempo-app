'use client';

import { useState, useEffect } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { BarChart3 } from 'lucide-react';

interface VideoCardProps {
  videoUrl: string | null;
  videoTitle: string;
  creatorName: string;
  gmv: number;
  orders: number;
  postDate: string | null;
}

function formatGmv(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPostDate(dateStr: string | null): string {
  if (!dateStr) return 'Unknown';
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays <= 14) {
    return formatDistanceToNow(date, { addSuffix: true });
  }
  return format(date, 'MMM d');
}

// Simple in-memory cache for thumbnails
const thumbnailCache = new Map<string, string | null>();

export function VideoCard({ videoUrl, videoTitle, creatorName, gmv, orders, postDate }: VideoCardProps) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!videoUrl) {
      setLoading(false);
      return;
    }

    // Check cache first
    if (thumbnailCache.has(videoUrl)) {
      setThumbnail(thumbnailCache.get(videoUrl) ?? null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`, {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        const url = data.thumbnail_url ?? null;
        thumbnailCache.set(videoUrl, url);
        setThumbnail(url);
      })
      .catch(() => {
        thumbnailCache.set(videoUrl, null);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [videoUrl]);

  return (
    <a
      href={videoUrl ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="group rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D8D]/40 focus-visible:ring-offset-1"
    >
      {/* Thumbnail */}
      <div className="relative aspect-[9/12] bg-gradient-to-br from-pink-50 to-purple-50 overflow-hidden">
        {loading ? (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-pink-100/50 to-purple-100/50" />
        ) : thumbnail ? (
          <img
            src={thumbnail}
            alt={videoTitle}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 motion-reduce:transform-none motion-reduce:transition-none"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-300">
            <BarChart3 className="h-8 w-8" />
          </div>
        )}
        {/* GMV badge */}
        <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-white text-xs font-bold px-2 py-1 rounded-lg tabular-nums font-mono">
          {formatGmv(gmv)}
        </div>
      </div>

      {/* Info */}
      <div className="p-3 space-y-1">
        <p className="text-sm font-semibold text-[#1A1B3A] truncate">{creatorName}</p>
        <p className="text-xs text-gray-500 truncate">{videoTitle || 'Untitled'}</p>
        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-gray-400 pt-1">
          <span><span className="font-bold">{orders}</span> order{orders !== 1 ? 's' : ''}</span>
          <span>{formatPostDate(postDate)}</span>
        </div>
      </div>
    </a>
  );
}
