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
  const resolvedAccent = accentColor ?? brandColor ?? '#FF4D8D';

  // ── Hero variant ─────────────────────────────────────────────────────────
  if (hero) {
    return (
      <div
        className={cn(
          'relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#1A1B3A] via-[#2D1B69] to-[#1A1B3A]',
          'shadow-lg shadow-[#1A1B3A]/30',
          'hover:-translate-y-0.5 transition-all duration-300',
          className,
        )}
      >
        {/* Decorative orbs */}
        <div className="absolute top-0 right-0 w-28 h-28 rounded-full blur-2xl -translate-y-1/2 translate-x-1/4"
          style={{ backgroundColor: `${resolvedAccent}30` }} />
        <div className="absolute bottom-0 left-0 w-20 h-20 bg-[#7C5CFC]/20 rounded-full blur-2xl translate-y-1/2 -translate-x-1/4" />

        <div className="relative p-5 pb-3">
          {/* Label + icon row */}
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium uppercase tracking-wider text-white/50">{label}</p>
            <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center">
              <Icon className="h-4 w-4 text-white/70" />
            </div>
          </div>

          {/* Value */}
          <p className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mt-1">{value}</p>

          {/* Trend */}
          {trend !== undefined && (
            <div className="flex items-center gap-1.5 mt-2">
              <span className={cn(
                'flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-semibold',
                isPositive ? 'bg-emerald-400/20 text-emerald-300' : 'bg-red-400/20 text-red-300',
              )}>
                {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
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
        'relative rounded-2xl bg-white shadow-sm p-5 space-y-2',
        'hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-default',
        className,
      )}
      style={{
        border: accentColor ? `1px solid ${accentColor}20` : '1px solid #F3F4F6',
        borderLeft: accentColor ? `3px solid ${accentColor}` : undefined,
      }}
    >
      {/* Label + icon */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${resolvedAccent}12` }}
        >
          <Icon className="h-4 w-4" style={{ color: resolvedAccent }} />
        </div>
      </div>

      {/* Value */}
      <p className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-[#1A1B3A]">{value}</p>

      {/* Sub-value */}
      {subValue && (
        <p className="text-xs font-medium" style={{ color: resolvedAccent }}>{subValue}</p>
      )}

      {/* Trend badge */}
      {trend !== undefined && (
        <div className="flex items-center gap-1.5 text-sm">
          <span className={cn(
            'flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-semibold',
            isPositive ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500',
          )}>
            {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
          </span>
          {trendLabel && <span className="text-gray-400 text-xs">{trendLabel}</span>}
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
