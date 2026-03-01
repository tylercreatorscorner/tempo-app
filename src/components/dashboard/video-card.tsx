'use client';

import { useState, useEffect } from 'react';
import { formatDistanceToNow, format } from 'date-fns';

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
      className="group rounded-xl bg-white border border-gray-100 shadow-sm overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer block"
    >
      {/* Thumbnail */}
      <div className="relative aspect-[9/12] bg-gradient-to-br from-pink-50 to-purple-50 overflow-hidden">
        {loading ? (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-pink-100/50 to-purple-100/50" />
        ) : thumbnail ? (
          <img
            src={thumbnail}
            alt={videoTitle}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-300">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        )}
        {/* GMV badge */}
        <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-white text-xs font-bold px-2 py-1 rounded-lg">
          {formatGmv(gmv)}
        </div>
      </div>

      {/* Info */}
      <div className="p-3 space-y-1">
        <p className="text-sm font-semibold text-[#1A1B3A] truncate">{creatorName}</p>
        <p className="text-xs text-gray-500 truncate">{videoTitle || 'Untitled'}</p>
        <div className="flex items-center justify-between text-xs text-gray-400 pt-1">
          <span>{orders} order{orders !== 1 ? 's' : ''}</span>
          <span>{formatPostDate(postDate)}</span>
        </div>
      </div>
    </a>
  );
}
