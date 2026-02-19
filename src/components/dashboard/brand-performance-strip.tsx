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
  const totalGmv = brands.reduce((sum, b) => sum + b.gmv, 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {brands.map((b) => {
        const color = BRAND_COLORS[b.brand] ?? '#6B7280';
        const name = BRAND_DISPLAY_NAMES[b.brand] ?? b.brand;
        const pct = totalGmv > 0 ? (b.gmv / totalGmv) * 100 : 0;
        return (
          <div
            key={b.brand}
            className="group rounded-xl border border-border bg-card p-4 flex flex-col gap-3 hover:scale-[1.02] transition-all duration-200 cursor-default"
            style={{ '--brand-color': color } as React.CSSProperties}
          >
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-1.5 rounded-full shrink-0 group-hover:shadow-lg transition-shadow duration-200"
                style={{ backgroundColor: color, boxShadow: 'none' }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{name}</p>
                <p className="text-xl font-bold tracking-tight">{formatCurrency(b.gmv)}</p>
              </div>
              <span className="text-xs text-muted-foreground font-medium">{pct.toFixed(1)}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-muted/50 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
