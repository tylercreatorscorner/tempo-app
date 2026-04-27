'use client';

import { useState, useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { BRAND_COLORS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import { VideoTitleButton } from '@/components/video/video-title-button';

export interface TopPost {
  video_id: string;
  video_title: string;
  creator_name: string;
  total_gmv: number;
  total_orders: number;
  total_items_sold: number;
  total_views: number;
  days_active: number;
  brand: string;
}

type Metric = 'total_gmv' | 'total_views';

const METRICS: Array<{ key: Metric; label: string; format: (n: number) => string }> = [
  { key: 'total_gmv',   label: 'GMV',   format: (n) => formatCurrency(n) },
  { key: 'total_views', label: 'Views', format: (n) => formatNumber(n) },
];

interface Props {
  posts: TopPost[];
  limit?: number;
}

export function TopPostsCard({ posts, limit = 10 }: Props) {
  const [metric, setMetric] = useState<Metric>('total_gmv');

  const sorted = useMemo(() => {
    return [...posts].sort((a, b) => b[metric] - a[metric]).slice(0, limit);
  }, [posts, metric, limit]);

  const cfg = METRICS.find((m) => m.key === metric)!;
  const max = sorted[0]?.[metric] ?? 1;

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[#1A1B3A]">Top Posts</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Highest-performing videos by {cfg.label.toLowerCase()} · top {Math.min(limit, sorted.length)}
          </p>
        </div>
        {/* Metric toggle */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
          {METRICS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setMetric(key)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                metric === key ? 'bg-white text-[#1A1B3A] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-gray-50">
        {sorted.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">No posts in this period</div>
        ) : (
          sorted.map((post, i) => {
            const value = post[metric];
            const pct = (value / max) * 100;
            const brandColor = BRAND_COLORS[post.brand] ?? '#6B7280';
            return (
              <div key={`${post.video_id}-${i}`} className="px-5 py-3.5 hover:bg-gray-50/60 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="text-xs text-gray-300 font-bold tabular-nums w-6">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <VideoTitleButton
                        videoData={{
                          video_id: post.video_id,
                          video_title: post.video_title,
                          creator_name: post.creator_name,
                          brand: post.brand,
                          gmv: post.total_gmv,
                          orders: post.total_orders,
                          items_sold: post.total_items_sold,
                          days_selling: post.days_active,
                        }}
                        className="text-sm font-medium text-[#1A1B3A] hover:text-[#E91E8C] hover:underline transition-colors truncate min-w-0 text-left"
                      >
                        {post.video_title}
                      </VideoTitleButton>
                      <span
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0"
                        style={{ backgroundColor: `${brandColor}18`, color: brandColor }}
                      >
                        {BRAND_DISPLAY_NAMES[post.brand] ?? post.brand}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">
                      <a
                        href={`https://tiktok.com/@${post.creator_name}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-[#E91E8C] transition-colors inline-flex items-center gap-0.5"
                      >
                        @{post.creator_name}
                        <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                      </a>
                      {' · '}{post.days_active}d active
                      {post.total_views > 0 && metric !== 'total_views' && ` · ${formatNumber(post.total_views)} views`}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right min-w-[100px]">
                    <p className="text-sm font-bold text-[#1A1B3A] tabular-nums">{cfg.format(value)}</p>
                    {/* Mini bar showing relative performance */}
                    <div className="h-1 mt-1 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: brandColor }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
