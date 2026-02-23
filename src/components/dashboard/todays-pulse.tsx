'use client';

import { formatCurrency } from '@/lib/utils/format';
import { BRAND_COLORS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import { ExternalLink } from 'lucide-react';

interface ViralVideo {
  video_title: string;
  creator_name: string;
  brand: string;
  total_gmv: number;
  video_link: string | null;
}

interface Props {
  viralVideos: ViralVideo[];
  creatorsImproved: number;
  creatorsDeclined: number;
  creatorsGhost: number;
  gmvDelta: number;
  gmvDeltaPct: number | undefined;
}

export function TodaysPulse({ viralVideos, creatorsImproved, creatorsDeclined, creatorsGhost, gmvDelta, gmvDeltaPct }: Props) {
  const hasViralVideos = viralVideos.length > 0;
  const hasMovements = creatorsImproved > 0 || creatorsDeclined > 0 || creatorsGhost > 0;

  if (!hasViralVideos && !hasMovements && gmvDeltaPct === undefined) return null;

  return (
    <div className="relative rounded-2xl border border-white/40 p-5 overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(248,249,252,0.9) 100%)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.6)',
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-bold text-[#1A1B3A] animate-pulse-subtle">Today&apos;s Pulse</h2>
        <span className="text-xs text-gray-400 font-medium">What changed</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Viral Videos */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">🔥 Hot Videos</p>
          {viralVideos.length === 0 ? (
            <p className="text-sm text-gray-400">No standout videos today</p>
          ) : (
            viralVideos.slice(0, 3).map((v, i) => (
              <div key={i} className="flex items-start gap-2 group">
                <span className="text-base leading-none mt-0.5">🔥</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#1A1B3A] truncate">{v.video_title || 'Untitled'}</p>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: BRAND_COLORS[v.brand] ?? '#6B7280' }} />
                    <span className="truncate">{v.creator_name}</span>
                    <span className="font-semibold text-[#1A1B3A]">{formatCurrency(v.total_gmv)}</span>
                    {v.video_link && (
                      <a href={v.video_link} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-[#FF4D8D] transition-colors">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Creator Movements */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">👥 Creator Movements</p>
          <div className="space-y-1.5">
            {creatorsImproved > 0 && (
              <p className="text-sm"><span className="text-green-500 font-semibold">↑ {creatorsImproved}</span> <span className="text-gray-500">improved</span></p>
            )}
            {creatorsDeclined > 0 && (
              <p className="text-sm"><span className="text-red-500 font-semibold">↓ {creatorsDeclined}</span> <span className="text-gray-500">declined</span></p>
            )}
            {creatorsGhost > 0 && (
              <p className="text-sm"><span className="text-gray-400 font-semibold">👻 {creatorsGhost}</span> <span className="text-gray-500">went ghost</span></p>
            )}
            {!hasMovements && (
              <p className="text-sm text-gray-400">No significant movements</p>
            )}
          </div>
        </div>

        {/* Portfolio Delta */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">📊 Portfolio GMV</p>
          <div>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-extrabold ${gmvDelta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {gmvDelta >= 0 ? '↑' : '↓'} {formatCurrency(Math.abs(gmvDelta))}
              </span>
            </div>
            {gmvDeltaPct !== undefined && (
              <p className={`text-sm font-semibold ${gmvDeltaPct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {gmvDeltaPct >= 0 ? '+' : ''}{gmvDeltaPct.toFixed(1)}% vs prior period
              </p>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse-subtle {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }
        .animate-pulse-subtle {
          animation: pulse-subtle 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
