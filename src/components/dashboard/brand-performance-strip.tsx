import { BRAND_COLORS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface BrandData {
  brand: string;
  gmv: number;
  trend?: number;
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
            className="group relative rounded-2xl p-4 flex flex-col gap-3 cursor-default overflow-hidden bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-white/[0.07] hover:border-white/[0.15] transition-all duration-300 ease-out"
          >
            {/* Brand-colored glow on hover */}
            <div
              className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
              style={{ background: `radial-gradient(ellipse at top left, ${color}10, transparent 70%)` }}
            />

            <div className="relative flex items-center gap-3">
              <div
                className="h-10 w-1.5 rounded-full shrink-0 transition-all duration-300 group-hover:h-12 group-hover:shadow-[0_0_12px_var(--glow)]"
                style={{ backgroundColor: color, '--glow': `${color}60` } as React.CSSProperties}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white/70 group-hover:text-white/90 transition-colors">{name}</p>
                <p className="text-xl font-bold tracking-tight">{formatCurrency(b.gmv)}</p>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-xs text-muted-foreground/70 font-medium tabular-nums">{pct.toFixed(1)}%</span>
                {b.trend !== undefined && (
                  <span className={`flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-md ${b.trend >= 0 ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                    {b.trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {b.trend >= 0 ? '+' : ''}{b.trend.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
            <div className="relative w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${color}, ${color}CC)`,
                  boxShadow: `0 0 8px ${color}40`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
