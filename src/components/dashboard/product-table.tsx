import { formatCurrency, formatNumber } from '@/lib/utils/format';

interface Product {
  product_name: string;
  total_gmv: number;
  total_orders: number;
  total_items_sold: number;
}

interface Props {
  products: Product[];
}

export function ProductTable({ products }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border">
        <h3 className="text-lg font-semibold">Top Products</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
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
              <tr key={p.product_name + i} className="border-b border-border/50 hover:bg-muted/30">
                <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                <td className="px-4 py-3 font-medium max-w-xs truncate">{p.product_name}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(p.total_gmv)}</td>
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
