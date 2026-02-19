import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

interface Video {
  video_title: string;
  creator_name: string;
  total_gmv: number;
  total_views: number;
  total_orders: number;
}

interface Props {
  videos: Video[];
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-bold">1</span>;
  if (rank === 2) return <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-gray-400/20 text-gray-300 text-xs font-bold">2</span>;
  if (rank === 3) return <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-amber-700/20 text-amber-500 text-xs font-bold">3</span>;
  return <span className="text-muted-foreground text-sm">{rank}</span>;
}

export function VideoTable({ videos }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border">
        <h3 className="text-lg font-semibold">Top Videos</h3>
      </div>
      <div className="overflow-x-auto max-h-[800px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-4 py-3 text-left font-medium w-12">#</th>
              <th className="px-4 py-3 text-left font-medium">Video</th>
              <th className="px-4 py-3 text-left font-medium">Creator</th>
              <th className="px-4 py-3 text-right font-medium">GMV</th>
              <th className="px-4 py-3 text-right font-medium">Views</th>
              <th className="px-4 py-3 text-right font-medium">Orders</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((v, i) => (
              <tr key={i} className={cn(
                'border-b border-border/50 hover:bg-muted/40 transition-colors duration-150',
                i % 2 === 1 && 'bg-muted/10'
              )}>
                <td className="px-4 py-3"><RankBadge rank={i + 1} /></td>
                <td className="px-4 py-3 font-medium max-w-xs truncate">{v.video_title || 'Untitled'}</td>
                <td className="px-4 py-3 text-muted-foreground">{v.creator_name}</td>
                <td className="px-4 py-3 text-right font-medium">{formatCurrency(v.total_gmv)}</td>
                <td className="px-4 py-3 text-right">{v.total_views != null ? formatNumber(v.total_views) : '-'}</td>
                <td className="px-4 py-3 text-right">{formatNumber(v.total_orders)}</td>
              </tr>
            ))}
            {videos.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No video data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
