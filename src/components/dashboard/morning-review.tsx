import Link from 'next/link';
import { BrandIdentity } from '@/components/creators/brand-identity';
import { formatCurrency } from '@/lib/utils/format';
import type { DashboardSignal } from '@/lib/data/dashboard-signals';
import styles from './morning-review.module.css';

export function MorningReview({ attention, opportunities, available, labels, start, end }: {
  attention: DashboardSignal[]; opportunities: DashboardSignal[]; available: boolean;
  labels: Record<string, string>; start: string; end: string;
}) {
  function signalRow(row: DashboardSignal, positive: boolean) {
    return <Link key={row.slug} className={styles.item} href={`/dashboard?${new URLSearchParams({brand:row.slug, range:'custom',start,end})}`}>
      <BrandIdentity brand={row.slug} label={labels[row.slug] ?? row.slug} />
      <span className={`${styles.delta} ${row.kind === 'coverage' ? '' : positive ? styles.positive : styles.negative}`}>
        {row.kind === 'coverage' ? 'Check data' : <>{row.delta > 0 ? '+' : '−'}{formatCurrency(Math.abs(row.delta))}<small>{row.percent === null ? 'From $0' : `${row.percent > 0 ? '+' : '−'}${Math.abs(row.percent).toFixed(1)}%`}</small></>}
      </span>
    </Link>;
  }
  function group(title: string, rows: DashboardSignal[], positive: boolean) {
    return <section className={styles.group} aria-label={title}>
      <header><h2>{title} <span className="text-muted-foreground text-sm">{available ? rows.length : '—'}</span></h2></header>
      {!available ? <p className={styles.empty}>Signals unavailable. Current totals, prior totals, and recorded days are needed before comparing brands.</p>
        : rows.length === 0 ? <p className={styles.empty}>No {positive ? 'growth' : 'attention'} signals in this period.</p>
        : rows.slice(0, 3).map(row => signalRow(row, positive))}
      {rows.length > 3 && <details className={styles.more}><summary>Show {rows.length - 3} more</summary>{rows.slice(3).map(row => signalRow(row, positive))}</details>}
    </section>;
  }
  return <div>
    <div className={styles.groups}>{group('Needs attention',attention,false)}{group('Opportunities',opportunities,true)}</div>
    <details className={styles.rules}><summary>How these signals are selected</summary>
      GMV changes must be at least 10% and $100 versus the prior equal-length period. Growth from zero must reach $100 and has no percentage. Missing recorded days suppress movement signals; recorded days do not guarantee every file was imported. Changes are ordered by dollar impact, with data checks after declines. These signals identify questions, not causes or profit. Posting, spend-change, and coaching signals will need their own evidence.
    </details>
  </div>;
}
