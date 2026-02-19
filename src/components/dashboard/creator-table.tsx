import { formatCurrency, formatNumber } from '@/lib/utils/format';

interface Creator {
  creator_name: string;
  total_gmv: number;
  total_orders: number;
  total_items_sold: number;
  video_count: number;
}

interface Props {
  creators: Creator[];
}

export function CreatorTable({ creators }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border">
        <h3 className="text-lg font-semibold">Top Creators</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-4 py-3 text-left font-medium w-12">#</th>
              <th className="px-4 py-3 text-left font-medium">Creator</th>
              <th className="px-4 py-3 text-right font-medium">GMV</th>
              <th className="px-4 py-3 text-right font-medium">Orders</th>
              <th className="px-4 py-3 text-right font-medium">Items</th>
              <th className="px-4 py-3 text-right font-medium">Videos</th>
            </tr>
          </thead>
          <tbody>
            {creators.map((c, i) => (
              <tr key={c.creator_name + i} className="border-b border-border/50 hover:bg-muted/30">
                <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                <td className="px-4 py-3 font-medium">{c.creator_name}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(c.total_gmv)}</td>
                <td className="px-4 py-3 text-right">{formatNumber(c.total_orders)}</td>
                <td className="px-4 py-3 text-right">{formatNumber(c.total_items_sold)}</td>
                <td className="px-4 py-3 text-right">{formatNumber(c.video_count)}</td>
              </tr>
            ))}
            {creators.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No creator data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
