'use client';

import type { RisingVideo, TrendingVideo, TopVideo, BreakoutCreator } from '@/lib/data/whats-hot';
import { BRAND_COLORS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import { ArrowUpRight, TrendingUp, Flame, Trophy, Sparkles, ExternalLink } from 'lucide-react';

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function formatPct(n: number): string {
  if (n >= 10000) return `+${Math.round(n / 1000)}K%`;
  return `+${n.toFixed(0)}%`;
}

function BrandBadge({ brand }: { brand: string }) {
  const color = BRAND_COLORS[brand] ?? '#6B7280';
  const name = BRAND_DISPLAY_NAMES[brand] ?? brand;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color }}>
      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}

function VideoLink({ videoId, creatorName, videoLink }: { videoId: string; creatorName: string; videoLink: string | null }) {
  const url = videoLink || `https://www.tiktok.com/@${creatorName}/video/${videoId}`;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-[#FF4D8D] transition-colors">
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

function CardShell({ title, icon, children, emptyMsg }: { title: string; icon: React.ReactNode; children: React.ReactNode; emptyMsg: string }) {
  return (
    <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
        {icon}
        <h3 className="text-base font-bold tracking-tight text-[#1A1B3A]">{title}</h3>
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {children || (
          <div className="px-5 py-8 text-center text-sm text-gray-400">{emptyMsg}</div>
        )}
      </div>
    </div>
  );
}

interface Props {
  risingVideos: RisingVideo[];
  trendingVideos: TrendingVideo[];
  topVideos: TopVideo[];
  breakoutCreators: BreakoutCreator[];
}

export function WhatsHotGrid({ risingVideos, trendingVideos, topVideos, breakoutCreators }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Rising Videos */}
      <CardShell
        title="Rising Videos"
        icon={<TrendingUp className="h-4.5 w-4.5 text-green-500" />}
        emptyMsg="No rising videos detected in the last 6 days"
      >
        {risingVideos.length > 0 && (
          <ul className="divide-y divide-gray-50">
            {risingVideos.map((v, i) => (
              <li key={v.video_id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/60 transition-colors group">
                <span className="text-xs font-bold text-gray-300 w-5 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#1A1B3A] truncate">{v.video_title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-500">{v.creator_name}</span>
                    <BrandBadge brand={v.brand} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-[#1A1B3A]">{formatCurrency(v.recent_avg_gmv)}<span className="text-xs text-gray-400">/day</span></p>
                  <p className="text-xs font-medium text-green-500 flex items-center justify-end gap-0.5">
                    <ArrowUpRight className="h-3 w-3" />
                    {formatPct(v.growth_pct)}
                  </p>
                </div>
                <VideoLink videoId={v.video_id} creatorName={v.creator_name} videoLink={v.video_link} />
              </li>
            ))}
          </ul>
        )}
      </CardShell>

      {/* Trending New Content */}
      <CardShell
        title="Trending New Content"
        icon={<Sparkles className="h-4.5 w-4.5 text-amber-500" />}
        emptyMsg="No new trending videos in the last 7 days"
      >
        {trendingVideos.length > 0 && (
          <ul className="divide-y divide-gray-50">
            {trendingVideos.map((v, i) => (
              <li key={v.video_id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/60 transition-colors group">
                <span className="text-xs font-bold text-gray-300 w-5 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#1A1B3A] truncate">{v.video_title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-500">{v.creator_name}</span>
                    <BrandBadge brand={v.brand} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-[#1A1B3A]">{formatCurrency(v.total_gmv)}</p>
                  <p className="text-xs text-gray-400">{v.days_since_posted}d ago</p>
                </div>
                <VideoLink videoId={v.video_id} creatorName={v.creator_name} videoLink={v.video_link} />
              </li>
            ))}
          </ul>
        )}
      </CardShell>

      {/* Top Videos */}
      <CardShell
        title="Top Videos"
        icon={<Trophy className="h-4.5 w-4.5 text-[#FF4D8D]" />}
        emptyMsg="No video data for this period"
      >
        {topVideos.length > 0 && (
          <ul className="divide-y divide-gray-50">
            {topVideos.map((v, i) => (
              <li key={v.video_id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/60 transition-colors group">
                <span className="text-xs font-bold text-gray-300 w-5 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#1A1B3A] truncate">{v.video_title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-500">{v.creator_name}</span>
                    <BrandBadge brand={v.brand} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-[#1A1B3A]">{formatCurrency(v.total_gmv)}</p>
                  <p className="text-xs text-gray-400">{v.total_orders} orders</p>
                </div>
                <VideoLink videoId={v.video_id} creatorName={v.creator_name} videoLink={v.video_link} />
              </li>
            ))}
          </ul>
        )}
      </CardShell>

      {/* Breakout Creators */}
      <CardShell
        title="Breakout Creators"
        icon={<Flame className="h-4.5 w-4.5 text-orange-500" />}
        emptyMsg="No breakout creators detected this period"
      >
        {breakoutCreators.length > 0 && (
          <ul className="divide-y divide-gray-50">
            {breakoutCreators.map((c, i) => (
              <li key={`${c.creator_name}-${c.brand}`} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/60 transition-colors">
                <span className="text-xs font-bold text-gray-300 w-5 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#1A1B3A]">🔥 {c.creator_name}</p>
                  <BrandBadge brand={c.brand} />
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-[#1A1B3A]">{formatCurrency(c.current_gmv)}</p>
                  <p className="text-xs text-gray-400">was {formatCurrency(c.prior_gmv)}</p>
                </div>
                <span className="text-xs font-bold text-green-500 flex items-center gap-0.5 shrink-0">
                  <ArrowUpRight className="h-3 w-3" />
                  {formatPct(c.growth_pct)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardShell>
    </div>
  );
}
