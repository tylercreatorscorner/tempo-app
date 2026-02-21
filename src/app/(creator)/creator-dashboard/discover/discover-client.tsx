'use client';

import { useState } from 'react';
import type { CreatorVideo } from '@/lib/data/creator';

type VideoWithCreator = CreatorVideo & { creator_name: string };

function formatMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

interface Props {
  hotVideos: VideoWithCreator[];
  topEarnerVideos: VideoWithCreator[];
}

export function DiscoverClient({ hotVideos, topEarnerVideos }: Props) {
  const [filter, setFilter] = useState<'hot' | 'topEarners'>('hot');

  const videos = filter === 'hot' ? hotVideos : topEarnerVideos;
  const descriptions: Record<string, string> = {
    hot: 'Recent videos gaining traction — posted in the last 14 days with strong early performance.',
    topEarners: 'Highest earning videos over the last 30 days.',
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="animate-fade-in">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#1A1B3A]">🔍 What&apos;s Working Right Now</h1>
        <p className="text-gray-500 mt-1">Learn from top-performing videos across your brand</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 animate-fade-in">
        <button
          onClick={() => setFilter('hot')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filter === 'hot' ? 'bg-[#FF4D8D] text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
        >
          🔥 Hot Right Now
        </button>
        <button
          onClick={() => setFilter('topEarners')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filter === 'topEarners' ? 'bg-[#FF4D8D] text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
        >
          💰 Top Earners
        </button>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-400 animate-fade-in">{descriptions[filter]}</p>

      {/* Video Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
        {videos.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-400">No videos found for this period.</div>
        ) : (
          videos.map((v, i) => (
            <div
              key={v.video_id + '-' + i}
              className="bg-white/80 backdrop-blur border border-gray-100 rounded-xl p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <p className="text-sm font-semibold text-[#1A1B3A] line-clamp-2 flex-1">{v.video_title || v.video_id}</p>
                <span className="text-xs font-bold text-[#34D399] whitespace-nowrap">{formatMoney(v.total_gmv)}</span>
              </div>
              <p className="text-xs text-gray-400 mb-3">by <span className="font-medium text-[#7C5CFC]">{v.creator_name}</span></p>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>📦 {v.total_orders} orders</span>
                <span>🛒 {v.total_items_sold} items</span>
                <span>📅 {v.days_active}d</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
