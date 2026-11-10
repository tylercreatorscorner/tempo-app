import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import styles from './metric-grid.module.css';

/** Shared KPI layout. Metric content belongs in StatCard, not page CSS overrides. */
export function MetricGrid({ children, columns = 3, label, className }: {
  children: ReactNode;
  columns?: 3 | 4 | 5 | 6;
  label: string;
  className?: string;
}) {
  return <section
    className={cn(styles.grid, className)}
    style={{ '--metric-columns': columns } as CSSProperties}
    aria-label={label}
  >{children}</section>;
}
