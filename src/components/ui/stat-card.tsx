import { InterfaceIcon } from '@/components/ui/interface-icon';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SparklineStrip } from '@/components/charts/sparkline-strip';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import styles from './stat-card.module.css';

interface StatCardProps {
  label: string; value: string; trend?: number; trendLabel?: string; className?: string;
  brandColor?: string | null; hero?: boolean; accentColor?: string; subValue?: string;
  sparklineData?: number[]; info?: ReactNode; detail?: ReactNode;
  state?: 'ready' | 'loading' | 'unavailable';
}

/** One metric-card layout across the workspace; the lead metric gets a quiet accent. */
export function StatCard({ label, value, trend, trendLabel, className, brandColor, hero, accentColor, subValue, sparklineData, info, detail, state = 'ready' }: StatCardProps) {
  const resolvedAccent = accentColor ?? brandColor ?? 'var(--primary)';
  const isPositive = trend !== undefined && trend >= 0;
  const hasSpark = Boolean(sparklineData && sparklineData.length > 1);
  return <div className={cn(
    styles.card, hero && styles.hero, hasSpark && styles.withSpark, className,
  )} data-slot="stat-card" role="group" aria-label={label} aria-busy={state === 'loading' || undefined} style={accentColor ? { borderLeft: `3px solid ${accentColor}` } : undefined}>
    <div className={styles.header}><p className={styles.label}>{label}</p>{info && <InfoTooltip label={info} />}</div>
    <p className={styles.value} data-state={state}>{value}</p>
    {(trend !== undefined || subValue || trendLabel || detail) && <div className={styles.footer}>
      {trend !== undefined && <span className="inline-flex items-center gap-0.5 font-medium tabular-nums" style={{ color: isPositive ? 'var(--pulse-pos)' : 'var(--pulse-neg)' }}><InterfaceIcon name={isPositive ? 'increase' : 'decrease'} className="size-3" /><span className="sr-only">{isPositive ? 'Up ' : 'Down '}</span>{Math.abs(trend) < 1 ? Math.abs(trend).toFixed(1) : Math.round(Math.abs(trend))}%</span>}
      {trendLabel && <span className="text-muted-foreground">{trendLabel}</span>}{subValue && <span className="tabular-nums text-muted-foreground">{subValue}</span>}{detail && <div className={styles.detail}>{detail}</div>}
    </div>}
    {hasSpark && <div className={styles.spark}><SparklineStrip data={sparklineData!} color={resolvedAccent} height={40} /></div>}
  </div>;
}
