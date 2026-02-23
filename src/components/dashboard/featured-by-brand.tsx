'use client';

import { formatCurrency } from '@/lib/utils/format';
import { BRAND_COLORS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import { ExternalLink } from 'lucide-react';

interface VideoData {
  video_id: string;
  video_title: string;
  creator_name: string;
  brand: string;
  total_gmv: number;
  video_link?: string | null;
}

interface Props {
  videos: VideoData[];
}

function getTopVideoPerBrand(videos: VideoData[]): VideoData[] {
  const brandMap = new Map<string, VideoData>();
  
  for (const video of videos) {
    const currentTop = brandMap.get(video.brand);
    if (!currentTop || video.total_gmv > currentTop.total_gmv) {
      brandMap.set(video.brand, video);
    }
  }
  
  return Array.from(brandMap.values()).sort((a, b) => b.total_gmv - a.total_gmv);
}

export function FeaturedByBrand({ videos }: Props) {
  const topVideosByBrand = getTopVideoPerBrand(videos);
  
  if (topVideosByBrand.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
        <h3 className="text-lg font-bold tracking-tight text-[#1A1B3A] mb-4">Featured Videos by Brand</h3>
        <p className="text-gray-500">No featured videos available</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-lg font-bold tracking-tight text-[#1A1B3A]">Featured Videos by Brand</h3>
        <span className="text-xs text-gray-400 font-medium">Top performer each</span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {topVideosByBrand.map((video) => {
          const brandColor = BRAND_COLORS[video.brand] ?? '#6B7280';
          const brandName = BRAND_DISPLAY_NAMES[video.brand] ?? video.brand;
          
          return (
            <div 
              key={video.video_id}
              className="relative rounded-xl border border-gray-100 p-4 hover:shadow-md transition-all duration-200 group"
              style={{
                background: `linear-gradient(135deg, ${brandColor}08 0%, ${brandColor}02 100%)`,
              }}
            >
              {/* Brand Header */}
              <div className="flex items-center gap-2 mb-3">
                <div 
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: brandColor }}
                />
                <span className="font-semibold text-gray-800 text-sm">
                  {brandName}
                </span>
              </div>

              {/* Video Info */}
              <div className="space-y-2">
                <h4 className="font-medium text-gray-900 text-sm leading-tight line-clamp-2">
                  {video.video_title || 'Untitled Video'}
                </h4>
                
                <p className="text-xs text-gray-500">
                  by {video.creator_name}
                </p>
                
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-900">
                    {formatCurrency(video.total_gmv)}
                  </span>
                  
                  {video.video_link && (
                    <a
                      href={video.video_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gray-400 hover:text-[#FF4D8D] p-1 rounded-md hover:bg-white/50"
                      title="View on TikTok"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>

              {/* Subtle brand accent */}
              <div 
                className="absolute top-0 right-0 w-8 h-8 rounded-bl-xl opacity-10"
                style={{ backgroundColor: brandColor }}
              />
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-500">
          Showcasing top video from {topVideosByBrand.length} active brand{topVideosByBrand.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  );
}

// Add line-clamp utility (if not already available in your Tailwind config)
// Add this to your global CSS if needed:
/*
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
*/