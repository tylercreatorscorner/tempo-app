import { ArrowUpRight, ArrowDownRight, DollarSign, ShoppingCart, Package, TrendingUp, Users, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SparklineChart } from '@/components/charts/sparkline-chart';

interface StatCardProps {
  label: string;
  value: string;
  trend?: number;
  trendLabel?: string;
  className?: string;
  brandColor?: string | null;
  /** Dark gradient hero treatment — use for the primary GMV card */
  hero?: boolean;
  /** Colored left-border accent */
  accentColor?: string;
  /** Sub-label shown below the value (e.g. "26% of total") */
  subValue?: string;
  /** Sparkline data — array of numbers in chronological order */
  sparklineData?: number[];
}

const ICON_MAP: Record<string, typeof DollarSign> = {
  gmv: DollarSign,
  revenue: DollarSign,
  orders: ShoppingCart,
  items: Package,
  creators: Users,
  videos: Video,
  roi: TrendingUp,
  avg: TrendingUp,
};

function getIcon(label: string) {
  const key = Object.keys(ICON_MAP).find(k => label.toLowerCase().includes(k));
  return ICON_MAP[key ?? ''] ?? TrendingUp;
}

export function StatCard({
  label,
  value,
  trend,
  trendLabel,
  className,
  brandColor,
  hero,
  accentColor,
  subValue,
  sparklineData,
}: StatCardProps) {
  const Icon = getIcon(label);
  const isPositive = trend !== undefined && trend >= 0;
  const resolvedAccent = accentColor ?? brandColor ?? 'var(--primary)';

  // ── Hero variant ─────────────────────────────────────────────────────────
  if (hero) {
    return (
      <div
        className={cn(
          'relative rounded-2xl overflow-hidden bg-gradient-to-br from-[var(--foreground)] via-[#2D1B69] to-[var(--foreground)]',
          'shadow-lg shadow-[var(--foreground)]/30',
          'transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none',
          className,
        )}
      >
        {/* Decorative orbs */}
        <div className="absolute top-0 right-0 w-28 h-28 rounded-full blur-2xl -translate-y-1/2 translate-x-1/4"
          style={{ backgroundColor: `${resolvedAccent}30` }} />
        <div className="absolute bottom-0 left-0 w-20 h-20 bg-[var(--pulse-accent-2)]/20 rounded-full blur-2xl translate-y-1/2 -translate-x-1/4" />

        <div className="relative p-5 pb-3">
          {/* Label + icon row */}
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium uppercase tracking-wider text-white/50">{label}</p>
            <div className="h-8 w-8 rounded-lg bg-card/10 flex items-center justify-center">
              <Icon className="h-4 w-4 text-white/70" />
            </div>
          </div>

          {/* Value */}
          <p className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mt-1 font-mono tabular-nums">{value}</p>

          {/* Trend */}
          {trend !== undefined && (
            <div className="flex items-center gap-1.5 mt-2">
              <span className={cn(
                'flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-semibold',
                isPositive ? 'bg-emerald-400/20 text-emerald-300' : 'bg-red-400/20 text-red-300',
              )}>
                {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                <span className="tabular-nums">{trend >= 0 ? '+' : ''}{trend.toFixed(1)}%</span>
              </span>
              {trendLabel && <span className="text-white/40 text-xs">{trendLabel}</span>}
            </div>
          )}
        </div>

        {/* Sparkline flush to bottom */}
        {sparklineData && sparklineData.length > 1 && (
          <div className="-mx-0 -mb-1">
            <SparklineChart data={sparklineData} color={resolvedAccent} height={52} />
          </div>
        )}
      </div>
    );
  }

  // ── Standard variant ──────────────────────────────────────────────────────
  return (
    <div
      className={cn(
        'relative rounded-2xl border border-border bg-card shadow-sm p-5 space-y-2',
        'transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none',
        className,
      )}
      style={{
        borderLeft: accentColor ? `3px solid ${accentColor}` : undefined,
      }}
    >
      {/* Label + icon */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${resolvedAccent}12` }}
        >
          <Icon className="h-4 w-4" style={{ color: resolvedAccent }} />
        </div>
      </div>

      {/* Value */}
      <p className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-[var(--foreground)] font-mono tabular-nums">{value}</p>

      {/* Sub-value */}
      {subValue && (
        <p className="text-xs font-medium font-mono tabular-nums" style={{ color: resolvedAccent }}>{subValue}</p>
      )}

      {/* Trend badge */}
      {trend !== undefined && (
        <div className="flex items-center gap-1.5 text-sm">
          <span className={cn(
            'flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-semibold',
            isPositive ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-500',
          )}>
            {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            <span className="tabular-nums">{trend >= 0 ? '+' : ''}{trend.toFixed(1)}%</span>
          </span>
          {trendLabel && <span className="text-muted-foreground text-xs">{trendLabel}</span>}
        </div>
      )}

      {/* Sparkline — flush to the bottom edge of the card for visual lift */}
      {sparklineData && sparklineData.length > 1 && (
        <div className="-mx-5 -mb-5 mt-2">
          <SparklineChart data={sparklineData} color={resolvedAccent} height={40} />
        </div>
      )}
    </div>
  );
}
