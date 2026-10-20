import { InterfaceIcon } from '@/components/ui/interface-icon';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SparklineStrip } from '@/components/charts/sparkline-strip';
import { InfoTooltip } from '@/components/ui/info-tooltip';

interface StatCardProps {
  label: string; value: string; trend?: number; trendLabel?: string; className?: string;
  brandColor?: string | null; hero?: boolean; accentColor?: string; subValue?: string;
  sparklineData?: number[]; info?: ReactNode; detail?: ReactNode;
}

/** One metric-card layout across the workspace; the lead metric gets a quiet accent. */
export function StatCard({ label, value, trend, trendLabel, className, brandColor, hero, accentColor, subValue, sparklineData, info, detail }: StatCardProps) {
  const resolvedAccent = accentColor ?? brandColor ?? 'var(--primary)';
  const isPositive = trend !== undefined && trend >= 0;
  const valueSize = value.length > 11 ? 'text-[clamp(1rem,1.9vw,1.75rem)]' : 'text-[clamp(1.25rem,2.3vw,1.875rem)]';
  const hasSpark = Boolean(sparklineData && sparklineData.length > 1);
  return <div className={cn(
    'min-w-0 overflow-hidden rounded-[var(--workspace-surface-radius,14px)] border bg-card p-5 shadow-[var(--workspace-surface-shadow,var(--pulse-elev-1))]',
    hero ? 'border-primary/25' : 'border-border', hasSpark && 'pb-0', className,
  )} style={accentColor ? { borderLeft: `3px solid ${accentColor}` } : undefined}>
    <div className="flex items-center gap-1.5"><p className="text-xs font-medium text-muted-foreground">{label}</p>{info && <InfoTooltip label={info} />}</div>
    <p className={cn('mt-3 break-words font-semibold leading-tight tracking-[-0.035em] tabular-nums', hero ? 'text-primary' : 'text-foreground', valueSize)}>{value}</p>
    {(trend !== undefined || subValue || trendLabel || detail) && <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {trend !== undefined && <span className="inline-flex items-center gap-0.5 font-medium tabular-nums" style={{ color: isPositive ? 'var(--pulse-pos)' : 'var(--pulse-neg)' }}><InterfaceIcon name={isPositive ? 'increase' : 'decrease'} className="size-3" /><span className="sr-only">{isPositive ? 'Up ' : 'Down '}</span>{Math.abs(trend) < 1 ? Math.abs(trend).toFixed(1) : Math.round(Math.abs(trend))}%</span>}
      {trendLabel && <span className="text-muted-foreground">{trendLabel}</span>}{subValue && <span className="tabular-nums text-muted-foreground">{subValue}</span>}{detail && <div className="text-muted-foreground">{detail}</div>}
    </div>}
    {hasSpark && <div className="-mx-5 mt-3"><SparklineStrip data={sparklineData!} color={resolvedAccent} height={40} /></div>}
  </div>;
}
