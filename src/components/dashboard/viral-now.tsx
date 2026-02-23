'use client';

import { formatCurrency } from '@/lib/utils/format';
import { BRAND_COLORS } from '@/lib/utils/constants';
import { ExternalLink, TrendingUp } from 'lucide-react';

export interface ViralVideo {
  video_id: string;
  video_title: string;
  creator_name: string;
  brand: string;
  gmv: number;
  growth_pct: number | null;
  video_link: string | null;
}

interface Props {
  videos: ViralVideo[];
}

export function ViralNow({ videos }: Props) {
  if (videos.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-5 w-5 text-[#FF4D8D]" />
        <h2 className="text-lg font-bold text-[#1A1B3A]">Viral Right Now</h2>
        <span className="text-xs text-gray-400 font-medium">Rising &amp; trending videos</span>
      </div>

      {/* Horizontal scroll on mobile, grid on desktop */}
      <div className="flex gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-5 md:overflow-visible scrollbar-hide">
        {videos.slice(0, 5).map((v) => (
          <div
            key={v.video_id}
            className="flex-shrink-0 w-56 md:w-auto rounded-2xl bg-white border border-gray-100 shadow-sm p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group"
          >
            {/* Brand dot + creator */}
            <div className="flex items-center gap-1.5 mb-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: BRAND_COLORS[v.brand] ?? '#6B7280' }} />
              <span className="text-xs text-gray-500 truncate">{v.creator_name}</span>
            </div>

            {/* Title */}
            <p className="text-sm font-semibold text-[#1A1B3A] truncate mb-2" title={v.video_title}>
              {v.video_title || 'Untitled'}
            </p>

            {/* GMV + Growth */}
            <div className="flex items-baseline gap-1.5 mb-2">
              <span className="text-lg font-extrabold text-[#1A1B3A]">{formatCurrency(v.gmv)}</span>
              {v.growth_pct !== null && v.growth_pct > 0 && (
                <span className="text-xs font-semibold text-green-500">
                  ↑ {v.growth_pct > 999 ? '999+' : v.growth_pct.toFixed(0)}%
                </span>
              )}
            </div>

            {/* Growth bar */}
            {v.growth_pct !== null && v.growth_pct > 0 && (
              <div className="w-full bg-gray-100 rounded-full h-1.5 mb-2">
                <div
                  className="h-1.5 rounded-full bg-gradient-to-r from-[#FF4D8D] to-[#FF8EB3]"
                  style={{ width: `${Math.min(v.growth_pct, 100)}%` }}
                />
              </div>
            )}

            {/* TikTok link */}
            {v.video_link && (
              <a
                href={v.video_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-[#FF4D8D] transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                <span>View on TikTok</span>
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
