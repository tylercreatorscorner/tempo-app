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
  if (rank === 1) return <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-yellow-400/30 to-yellow-600/20 text-yellow-400 text-xs font-bold shadow-[0_0_8px_rgba(234,179,8,0.2)]">1</span>;
  if (rank === 2) return <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-gray-300/25 to-gray-500/15 text-gray-300 text-xs font-bold">2</span>;
  if (rank === 3) return <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-amber-600/25 to-amber-800/15 text-amber-500 text-xs font-bold">3</span>;
  return <span className="text-muted-foreground/50 text-sm tabular-nums">{rank}</span>;
}

export function ProductTable({ products }: Props) {
  return (
    <div className="rounded-2xl overflow-hidden bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
      <div className="px-6 py-4 border-b border-white/[0.06]">
        <h3 className="text-lg font-bold tracking-tight">Top Products</h3>
        <p className="text-xs text-muted-foreground/60 mt-0.5">Ranked by GMV</p>
      </div>
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white/[0.03] backdrop-blur-md">
            <tr className="border-b border-white/[0.06] text-muted-foreground/60">
              <th className="px-6 py-3 text-left font-medium text-xs uppercase tracking-wider w-12">#</th>
              <th className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wider">Product</th>
              <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider">GMV</th>
              <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider">Orders</th>
              <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider pr-6">Items</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => (
              <tr key={p.product_name + i} className={cn(
                'border-b border-white/[0.04] transition-all duration-200',
                'hover:bg-white/[0.06] hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]',
                i < 3 && 'bg-white/[0.02]'
              )}>
                <td className="px-6 py-3.5"><RankBadge rank={i + 1} /></td>
                <td className="px-4 py-3.5 font-medium max-w-xs truncate">{p.product_name}</td>
                <td className="px-4 py-3.5 text-right font-semibold tabular-nums">{formatCurrency(p.total_gmv)}</td>
                <td className="px-4 py-3.5 text-right text-white/60 tabular-nums">{formatNumber(p.total_orders)}</td>
                <td className="px-4 py-3.5 text-right text-white/60 tabular-nums pr-6">{formatNumber(p.total_items_sold)}</td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground/50">No product data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
