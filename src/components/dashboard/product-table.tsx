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
  if (rank === 1) return <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-500 text-white text-xs font-bold shadow-sm">1</span>;
  if (rank === 2) return <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 text-white text-xs font-bold">2</span>;
  if (rank === 3) return <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white text-xs font-bold">3</span>;
  return <span className="text-gray-400 text-sm tabular-nums">{rank}</span>;
}

export function ProductTable({ products }: Props) {
  return (
    <div className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-lg font-bold tracking-tight text-[#1A1B3A]">Top Products</h3>
        <p className="text-xs text-gray-400 mt-0.5">Ranked by GMV</p>
      </div>
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr className="border-b border-gray-100 text-gray-500">
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
                'border-b border-gray-50 transition-all duration-200',
                'hover:bg-gray-50',
              )}>
                <td className="px-6 py-3.5"><RankBadge rank={i + 1} /></td>
                <td className="px-4 py-3.5 font-medium max-w-xs truncate text-[#1A1B3A]">{p.product_name}</td>
                <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-[#1A1B3A]">{formatCurrency(p.total_gmv)}</td>
                <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums">{formatNumber(p.total_orders)}</td>
                <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums pr-6">{formatNumber(p.total_items_sold)}</td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">No product data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
