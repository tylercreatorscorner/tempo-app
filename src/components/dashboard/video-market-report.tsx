'use client';

import { formatCurrency, formatNumber } from '@/lib/utils/format';

interface VideoData {
  video_id: string;
  total_gmv: number;
}

interface Props {
  videos: VideoData[];
  hotThreshold?: number;
  risingThreshold?: number;
}

export function VideoMarketReport({ 
  videos, 
  hotThreshold = 100, 
  risingThreshold = 50 
}: Props) {
  if (videos.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
        <h3 className="text-lg font-bold tracking-tight text-[#1A1B3A] mb-4">Video Market Report</h3>
        <p className="text-gray-500">No video data available</p>
      </div>
    );
  }

  const hotVideos = videos.filter(v => v.total_gmv >= hotThreshold);
  const risingVideos = videos.filter(v => v.total_gmv >= risingThreshold && v.total_gmv < hotThreshold);
  const totalVideoGmv = videos.reduce((sum, v) => sum + v.total_gmv, 0);
  const avgGmvPerVideo = videos.length > 0 ? totalVideoGmv / videos.length : 0;

  const stats = [
    {
      label: 'Hot Videos',
      value: formatNumber(hotVideos.length),
      subtitle: `≥${formatCurrency(hotThreshold)} GMV`,
      color: 'text-red-500',
      bg: 'bg-red-50',
      border: 'border-red-100',
    },
    {
      label: 'Rising Videos', 
      value: formatNumber(risingVideos.length),
      subtitle: `${formatCurrency(risingThreshold)}-${formatCurrency(hotThreshold - 1)} GMV`,
      color: 'text-yellow-500',
      bg: 'bg-yellow-50', 
      border: 'border-yellow-100',
    },
    {
      label: 'Total Video GMV',
      value: formatCurrency(totalVideoGmv),
      subtitle: 'All videos combined',
      color: 'text-[#7C5CFC]',
      bg: 'bg-purple-50',
      border: 'border-purple-100',
    },
    {
      label: 'Avg GMV/Video',
      value: formatCurrency(avgGmvPerVideo),
      subtitle: 'Per video average',
      color: 'text-blue-500',
      bg: 'bg-blue-50',
      border: 'border-blue-100',
    },
  ];

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-lg font-bold tracking-tight text-[#1A1B3A]">Video Market Report</h3>
        <span className="text-xs text-gray-400 font-medium">Performance breakdown</span>
      </div>
      
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <div 
            key={index}
            className={`relative rounded-xl border p-4 ${stat.bg} ${stat.border}`}
          >
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {stat.label}
              </p>
              <p className={`text-xl font-extrabold ${stat.color}`}>
                {stat.value}
              </p>
              <p className="text-xs text-gray-500">
                {stat.subtitle}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Additional context */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-500">
          Tracking {formatNumber(videos.length)} total videos from current period
        </p>
      </div>
    </div>
  );
}