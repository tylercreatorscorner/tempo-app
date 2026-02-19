import { BRAND_COLORS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';

interface BrandData {
  brand: string;
  gmv: number;
}

interface Props {
  brands: BrandData[];
}

export function BrandPerformanceStrip({ brands }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {brands.map((b) => {
        const color = BRAND_COLORS[b.brand] ?? '#6B7280';
        const name = BRAND_DISPLAY_NAMES[b.brand] ?? b.brand;
        return (
          <div
            key={b.brand}
            className="rounded-xl border border-border bg-card p-4 flex items-center gap-3"
          >
            <div
              className="h-10 w-1.5 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
            <div>
              <p className="text-sm font-medium">{name}</p>
              <p className="text-xl font-bold tracking-tight">{formatCurrency(b.gmv)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
