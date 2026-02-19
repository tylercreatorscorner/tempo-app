import { ArrowUpRight, ArrowDownRight, DollarSign, ShoppingCart, Package, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  trend?: number;
  trendLabel?: string;
  className?: string;
}

const ICON_MAP: Record<string, typeof DollarSign> = {
  gmv: DollarSign,
  revenue: DollarSign,
  orders: ShoppingCart,
  items: Package,
  commission: TrendingUp,
};

function getIcon(label: string) {
  const key = Object.keys(ICON_MAP).find((k) => label.toLowerCase().includes(k));
  return ICON_MAP[key ?? ''] ?? TrendingUp;
}

/** KPI stat card with hover lift and visual punch */
export function StatCard({ label, value, trend, trendLabel, className }: StatCardProps) {
  const isPositive = trend !== undefined && trend >= 0;
  const Icon = getIcon(label);

  return (
    <div className={cn(
      'rounded-xl border border-border bg-card p-5 space-y-2',
      'hover:scale-[1.02] hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5',
      'transition-all duration-200 cursor-default',
      className
    )}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
      <p className="text-3xl font-extrabold tracking-tight">{value}</p>
      {trend !== undefined && (
        <div className="flex items-center gap-1 text-sm">
          {isPositive ? (
            <ArrowUpRight className="h-4 w-4 text-green-500" />
          ) : (
            <ArrowDownRight className="h-4 w-4 text-red-500" />
          )}
          <span className={isPositive ? 'text-green-500' : 'text-red-500'}>
            {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
          </span>
          {trendLabel && (
            <span className="text-muted-foreground">{trendLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
