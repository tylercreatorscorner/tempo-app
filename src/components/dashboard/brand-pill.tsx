import { cn } from '@/lib/utils';
import { getBrandColor } from '@/lib/utils/constants';

interface BrandPillProps {
  brand: string;
  displayName: string;
  value?: string;
  trend?: number;
  className?: string;
}

/** Colored brand indicator pill */
export function BrandPill({ brand, displayName, value, trend, className }: BrandPillProps) {
  const color = getBrandColor(brand);

  return (
    <div className={cn('flex items-center gap-3 rounded-lg bg-card border border-border px-4 py-3', className)}>
      <div
        className="h-3 w-3 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{displayName}</p>
        {value && <p className="text-xs text-muted-foreground">{value}</p>}
      </div>
      {trend !== undefined && (
        <span className={cn(
          'text-xs font-medium',
          trend >= 0 ? 'text-green-500' : 'text-red-500'
        )}>
          {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
        </span>
      )}
    </div>
  );
}
