import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  trend?: number;
  trendLabel?: string;
  className?: string;
}

/** KPI stat card with optional trend indicator */
export function StatCard({ label, value, trend, trendLabel, className }: StatCardProps) {
  const isPositive = trend !== undefined && trend >= 0;

  return (
    <div className={cn(
      'rounded-xl border border-border bg-card p-5 space-y-2',
      className
    )}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
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
