'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { VideoCard } from './video-card';

export interface VideoData {
  video_id: string;
  video_url: string | null;
  video_title: string;
  tiktok_username: string;
  total_gmv: number;
  total_orders: number;
  post_date: string | null;
}

interface VideoSectionProps {
  title: string;
  emoji: string;
  videos: VideoData[];
  defaultExpanded?: boolean;
}

export function VideoSection({ title, emoji, videos, defaultExpanded = true }: VideoSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (videos.length === 0) return null;

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50/50 transition-colors duration-200"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{emoji}</span>
          <h3 className="text-lg font-bold tracking-tight text-[#1A1B3A]">{title}</h3>
          <span className="bg-[#FF4D8D]/10 text-[#FF4D8D] text-xs font-bold px-2.5 py-1 rounded-full">
            {videos.length}
          </span>
        </div>
        <ChevronDown
          className={`h-5 w-5 text-gray-400 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        className={`transition-all duration-300 ease-in-out ${
          expanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        } overflow-hidden`}
      >
        <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {videos.map((video) => (
            <VideoCard
              key={video.video_id}
              videoUrl={video.video_url}
              videoTitle={video.video_title}
              creatorName={video.tiktok_username}
              gmv={video.total_gmv}
              orders={video.total_orders}
              postDate={video.post_date}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
