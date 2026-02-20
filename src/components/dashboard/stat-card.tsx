import { ArrowUpRight, ArrowDownRight, DollarSign, ShoppingCart, Package, TrendingUp, Users, Video } from 'lucide-react';
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
  creators: Users,
  videos: Video,
  avg: TrendingUp,
};

function getIcon(label: string) {
  const key = Object.keys(ICON_MAP).find((k) => label.toLowerCase().includes(k));
  return ICON_MAP[key ?? ''] ?? TrendingUp;
}

export function StatCard({ label, value, trend, trendLabel, className }: StatCardProps) {
  const isPositive = trend !== undefined && trend >= 0;
  const Icon = getIcon(label);

  return (
    <div className={cn(
      'relative rounded-2xl p-5 space-y-2 cursor-default group overflow-hidden',
      'bg-white/[0.04] backdrop-blur-xl',
      'border border-white/[0.08]',
      'shadow-[0_4px_24px_rgba(0,0,0,0.2)]',
      'hover:scale-[1.03] hover:bg-white/[0.07] hover:border-white/[0.15]',
      'hover:shadow-[0_8px_40px_rgba(233,30,140,0.08)]',
      'transition-all duration-300 ease-out',
      className
    )}>
      {/* Subtle gradient overlay on hover */}
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />

      <div className="relative flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/80">{label}</p>
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center group-hover:from-primary/30 group-hover:to-primary/10 transition-all duration-300">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
      <p className="relative text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white to-white/80 bg-clip-text">{value}</p>
      {trend !== undefined && (
        <div className="relative flex items-center gap-1.5 text-sm">
          <div className={cn(
            'flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-semibold',
            isPositive ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
          )}>
            {isPositive ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
          </div>
          {trendLabel && (
            <span className="text-muted-foreground/60 text-xs">{trendLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
