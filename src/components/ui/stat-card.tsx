import { cn } from '@/lib/utils';
import { SparklineStrip } from '@/components/charts/sparkline-strip';

/**
 * Pulse KPI card (`.kt`). Clean label / big tabular value / detail line — no
 * icon chrome, per the design system. `hero` swaps in the signature hero
 * gradient with white text (use for the lead metric). `accentColor` adds a thin
 * left border for at-a-glance differentiation; `sparklineData` renders a trend
 * strip flush to the bottom edge.
 */
interface StatCardProps {
  label: string;
  value: string;
  trend?: number;
  trendLabel?: string;
  className?: string;
  brandColor?: string | null;
  hero?: boolean;
  accentColor?: string;
  subValue?: string;
  sparklineData?: number[];
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
  const resolvedAccent = accentColor ?? brandColor ?? 'var(--primary)';
  const isPositive = trend !== undefined && trend >= 0;
  const hasSpark = !!sparklineData && sparklineData.length > 1;

  if (hero) {
    return (
      <div className={cn('bg-pulse-hero relative overflow-hidden rounded-xl p-4 text-white', hasSpark && 'pb-0', className)}>
        <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-white/70">{label}</p>
        <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums">{value}</p>
        {(trend !== undefined || subValue || trendLabel) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-semibold text-white/80">
            {trend !== undefined && (
              <span className="tabular-nums">{isPositive ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%</span>
            )}
            {trendLabel && <span className="text-white/60">{trendLabel}</span>}
            {subValue && <span className="font-mono tabular-nums text-[11px] text-white/70">{subValue}</span>}
          </div>
        )}
        {hasSpark && (
          <div className="-mx-4 mt-3">
            <SparklineStrip data={sparklineData!} color="rgba(255,255,255,0.9)" height={44} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn('rounded-xl border border-border bg-card shadow-[var(--pulse-elev-1)] p-4', hasSpark && 'pb-0', className)}
      style={accentColor ? { borderLeft: `3px solid ${accentColor}` } : undefined}
    >
      <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums text-foreground">{value}</p>
      {(trend !== undefined || subValue || trendLabel) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-semibold">
          {trend !== undefined && (
            <span className="tabular-nums" style={{ color: isPositive ? 'var(--pulse-pos)' : 'var(--pulse-neg)' }}>
              {isPositive ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
            </span>
          )}
          {trendLabel && <span className="text-muted-foreground">{trendLabel}</span>}
          {subValue && <span className="font-mono tabular-nums text-[11px] text-muted-foreground">{subValue}</span>}
        </div>
      )}
      {hasSpark && (
        <div className="-mx-4 mt-3">
          <SparklineStrip data={sparklineData!} color={resolvedAccent} height={40} />
        </div>
      )}
    </div>
  );
}
