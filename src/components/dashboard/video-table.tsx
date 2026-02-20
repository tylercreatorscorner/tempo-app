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
  if (rank === 1) return <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-yellow-400/30 to-yellow-600/20 text-yellow-400 text-xs font-bold shadow-[0_0_8px_rgba(234,179,8,0.2)]">1</span>;
  if (rank === 2) return <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-gray-300/25 to-gray-500/15 text-gray-300 text-xs font-bold">2</span>;
  if (rank === 3) return <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-amber-600/25 to-amber-800/15 text-amber-500 text-xs font-bold">3</span>;
  return <span className="text-muted-foreground/50 text-sm tabular-nums">{rank}</span>;
}

export function VideoTable({ videos }: Props) {
  return (
    <div className="rounded-2xl overflow-hidden bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
      <div className="px-6 py-4 border-b border-white/[0.06]">
        <h3 className="text-lg font-bold tracking-tight">Top Videos</h3>
        <p className="text-xs text-muted-foreground/60 mt-0.5">Ranked by GMV</p>
      </div>
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white/[0.03] backdrop-blur-md">
            <tr className="border-b border-white/[0.06] text-muted-foreground/60">
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
                'border-b border-white/[0.04] transition-all duration-200',
                'hover:bg-white/[0.06] hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]',
                i < 3 && 'bg-white/[0.02]'
              )}>
                <td className="px-6 py-3.5"><RankBadge rank={i + 1} /></td>
                <td className="px-4 py-3.5 font-medium max-w-xs truncate">{v.video_title || 'Untitled'}</td>
                <td className="px-4 py-3.5 text-white/50">
                  <Link href={`/creators/${encodeURIComponent(v.creator_name)}`} className="hover:text-primary hover:underline transition-colors">
                    {v.creator_name}
                  </Link>
                </td>
                <td className="px-4 py-3.5 text-right font-semibold tabular-nums">{formatCurrency(v.total_gmv)}</td>
                <td className="px-4 py-3.5 text-right text-white/60 tabular-nums">{v.days_active != null ? formatNumber(v.days_active) : '-'}</td>
                <td className="px-4 py-3.5 text-right text-white/60 tabular-nums pr-6">{formatNumber(v.total_orders)}</td>
              </tr>
            ))}
            {videos.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground/50">No video data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
