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
      'bg-white border border-gray-100',
      'shadow-sm',
      'hover:shadow-md hover:-translate-y-0.5',
      'transition-all duration-300 ease-out',
      className
    )}>
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-pink-50/50 via-transparent to-transparent pointer-events-none" />

      <div className="relative flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-pink-50 to-pink-100/50 flex items-center justify-center group-hover:from-pink-100 group-hover:to-pink-50 transition-all duration-300">
          <Icon className="h-4 w-4 text-[#FF4D8D]" />
        </div>
      </div>
      <p className="relative text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-[#1A1B3A]">{value}</p>
      {trend !== undefined && (
        <div className="relative flex items-center gap-1.5 text-sm">
          <div className={cn(
            'flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-semibold',
            isPositive ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
          )}>
            {isPositive ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
          </div>
          {trendLabel && (
            <span className="text-gray-400 text-xs">{trendLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
