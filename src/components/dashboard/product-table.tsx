import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

interface Product {
  product_name: string;
  total_gmv: number;
  total_orders: number;
  total_items_sold: number;
}

interface Props {
  products: Product[];
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-bold">1</span>;
  if (rank === 2) return <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-gray-400/20 text-gray-300 text-xs font-bold">2</span>;
  if (rank === 3) return <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-amber-700/20 text-amber-500 text-xs font-bold">3</span>;
  return <span className="text-muted-foreground text-sm">{rank}</span>;
}

export function ProductTable({ products }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border">
        <h3 className="text-lg font-semibold">Top Products</h3>
      </div>
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-4 py-3 text-left font-medium w-12">#</th>
              <th className="px-4 py-3 text-left font-medium">Product</th>
              <th className="px-4 py-3 text-right font-medium">GMV</th>
              <th className="px-4 py-3 text-right font-medium">Orders</th>
              <th className="px-4 py-3 text-right font-medium">Items</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => (
              <tr key={p.product_name + i} className={cn(
                'border-b border-border/50 hover:bg-muted/40 transition-colors duration-150',
                i % 2 === 1 && 'bg-muted/10'
              )}>
                <td className="px-4 py-3"><RankBadge rank={i + 1} /></td>
                <td className="px-4 py-3 font-medium max-w-xs truncate">{p.product_name}</td>
                <td className="px-4 py-3 text-right font-medium">{formatCurrency(p.total_gmv)}</td>
                <td className="px-4 py-3 text-right">{formatNumber(p.total_orders)}</td>
                <td className="px-4 py-3 text-right">{formatNumber(p.total_items_sold)}</td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No product data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
