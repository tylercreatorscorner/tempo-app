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
  csvButton?: React.ReactNode;
}

function RankBadge({ rank }: { rank: number }) {
  return <span className="text-xs font-medium tabular-nums text-muted-foreground">{rank}</span>;
}

export function ProductTable({ products, csvButton }: Props) {
  return (
    <div className="rounded-xl overflow-hidden bg-card border border-border">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Product performance</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Ranked by GMV in the selected period</p>
        </div>
        {csvButton}
      </div>
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-4 py-3 text-left font-medium text-[11px] w-12">#</th>
              <th className="px-4 py-3 text-left font-medium text-[11px]">Product</th>
              <th className="px-4 py-3 text-right font-medium text-[11px]">GMV</th>
              <th className="px-4 py-3 text-right font-medium text-[11px]">Orders</th>
              <th className="px-4 py-3 text-right font-medium text-[11px] pr-6">Items</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => (
              <tr key={p.product_name + i} className={cn(
                'border-b border-border transition-all duration-200',
                'hover:bg-muted',
              )}>
                <td className="px-4 py-2.5"><RankBadge rank={i + 1} /></td>
                <td className="px-4 py-2.5 font-medium max-w-xs truncate text-[var(--foreground)]">
                  {p.product_name}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-[var(--foreground)]">{formatCurrency(p.total_gmv)}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">{formatNumber(p.total_orders)}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums pr-6">{formatNumber(p.total_items_sold)}</td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">No product data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
