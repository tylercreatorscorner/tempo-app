import Link from 'next/link';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

interface Video {
  video_title: string;
  creator_name: string;
  total_gmv: number;
  days_active: number;
  total_orders: number;
}

interface Props {
  videos: Video[];
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-500 text-white text-xs font-bold shadow-sm">1</span>;
  if (rank === 2) return <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 text-white text-xs font-bold">2</span>;
  if (rank === 3) return <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white text-xs font-bold">3</span>;
  return <span className="text-gray-400 text-sm tabular-nums">{rank}</span>;
}

export function VideoTable({ videos }: Props) {
  return (
    <div className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-lg font-bold tracking-tight text-[#1A1B3A]">Top Videos</h3>
        <p className="text-xs text-gray-400 mt-0.5">Ranked by GMV</p>
      </div>
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr className="border-b border-gray-100 text-gray-500">
              <th className="px-6 py-3 text-left font-medium text-xs uppercase tracking-wider w-12">#</th>
              <th className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wider">Video</th>
              <th className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wider">Creator</th>
              <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider">GMV</th>
              <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider">Days Active</th>
              <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider pr-6">Orders</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((v, i) => (
              <tr key={i} className={cn(
                'border-b border-gray-50 transition-all duration-200',
                'hover:bg-gray-50',
              )}>
                <td className="px-6 py-3.5"><RankBadge rank={i + 1} /></td>
                <td className="px-4 py-3.5 font-medium max-w-xs truncate text-[#1A1B3A]">{v.video_title || 'Untitled'}</td>
                <td className="px-4 py-3.5 text-gray-500">
                  <Link href={`/creators/${encodeURIComponent(v.creator_name)}`} className="hover:text-[#FF4D8D] hover:underline transition-colors">
                    {v.creator_name}
                  </Link>
                </td>
                <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-[#1A1B3A]">{formatCurrency(v.total_gmv)}</td>
                <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums">{v.days_active != null ? formatNumber(v.days_active) : '-'}</td>
                <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums pr-6">{formatNumber(v.total_orders)}</td>
              </tr>
            ))}
            {videos.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No video data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
