import { formatCurrency, formatNumber } from '@/lib/utils/format';

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

export function VideoTable({ videos }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border">
        <h3 className="text-lg font-semibold">Top Videos</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-4 py-3 text-left font-medium">Video</th>
              <th className="px-4 py-3 text-left font-medium">Creator</th>
              <th className="px-4 py-3 text-right font-medium">GMV</th>
              <th className="px-4 py-3 text-right font-medium">Views</th>
              <th className="px-4 py-3 text-right font-medium">Orders</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((v, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                <td className="px-4 py-3 font-medium max-w-xs truncate">{v.video_title || 'Untitled'}</td>
                <td className="px-4 py-3 text-muted-foreground">{v.creator_name}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(v.total_gmv)}</td>
                <td className="px-4 py-3 text-right">{formatNumber(v.total_views)}</td>
                <td className="px-4 py-3 text-right">{formatNumber(v.total_orders)}</td>
              </tr>
            ))}
            {videos.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No video data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
