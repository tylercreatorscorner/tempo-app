import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface FinanceMetric {
  label: string;
  value: string;
  detail?: ReactNode;
  tone?: 'primary' | 'positive' | 'negative' | 'warning';
}

/** Comparable finance figures share one surface, with no change to their scope. */
export function FinanceMetricStrip({ metrics, label = 'Financial summary' }: {
  metrics: FinanceMetric[];
  label?: string;
}) {
  return (
    <dl aria-label={label} className={cn(
      'grid min-w-0 grid-cols-2 overflow-hidden rounded-[var(--workspace-surface-radius,14px)] border border-border bg-card shadow-[var(--workspace-surface-shadow)]',
      metrics.length === 5 ? 'xl:grid-cols-5' : 'xl:grid-cols-4',
    )}>
      {metrics.map((metric) => (
        <div key={metric.label} className={cn('min-w-0 border-b border-r border-border px-4 py-3 last:border-r-0 xl:border-b-0', metrics.length % 2 === 1 && 'last:col-span-2 xl:last:col-span-1')}>
          <dt className="text-xs font-medium text-muted-foreground">{metric.label}</dt>
          <dd className={cn('mt-1.5 break-words text-[clamp(1.2rem,2vw,1.65rem)] font-semibold leading-tight tracking-tight tabular-nums',
            metric.tone === 'primary' ? 'text-primary' : metric.tone === 'positive' ? 'text-[var(--pulse-pos)]' : metric.tone === 'negative' ? 'text-[var(--pulse-neg)]' : metric.tone === 'warning' ? 'text-[var(--pulse-warn)]' : 'text-foreground',
          )}>{metric.value}</dd>
          {metric.detail && <dd className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">{metric.detail}</dd>}
        </div>
      ))}
    </dl>
  );
}
