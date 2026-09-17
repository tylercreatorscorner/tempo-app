"use client";

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import styles from './loading-status.module.css';

/** Honest indeterminate feedback: no fabricated percentages or completion times. */
export function LoadingStatus({ label = 'Loading your workspace', detail, className }: {
  label?: string; detail?: string; className?: string;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, []);
  return <div role="status" aria-live="polite" aria-atomic="true" className={cn(styles.status, className)}>
    <span className={styles.mark} aria-hidden="true"><i /><i /><i /></span>
    <div><p className={styles.label}>{label}</p>
      {(detail || slow) && <p className={styles.detail}>{slow ? 'Still loading. You can keep navigating.' : detail}</p>}
    </div>
  </div>;
}

export function ChartLoading({ label = 'Loading monthly performance' }: { label?: string }) {
  return <div className={styles.chart} aria-busy="true">
    <div className={styles.grid} aria-hidden="true" />
    <LoadingStatus label={label} detail="Preparing data for your selected brands and dates" className={styles.chartStatus} />
  </div>;
}
