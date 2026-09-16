import Link from 'next/link';
import { BrandIdentity } from '@/components/creators/brand-identity';
import { formatCurrency } from '@/lib/utils/format';
import type { DashboardSignal } from '@/lib/data/dashboard-signals';
import styles from './morning-review.module.css';

export function MorningReview({ attention, opportunities, available, labels, start, end }: {
  attention: DashboardSignal[]; opportunities: DashboardSignal[]; available: boolean;
  labels: Record<string, string>; start: string; end: string;
}) {
  function group(title: string, subtitle: string, rows: DashboardSignal[], positive: boolean) {
    return <section className={styles.group} aria-label={title}>
      <header><h2>{title} <span className="text-muted-foreground text-sm">{available ? rows.length : '—'}</span></h2><p>{subtitle}</p></header>
      {!available ? <p className={styles.empty}>Signals unavailable. Current totals, prior totals, and recorded days are needed before comparing brands.</p>
        : rows.length === 0 ? <p className={styles.empty}>{positive ? 'No growth signals meet the current review thresholds.' : 'No declines or missing-day signals meet the current review rules.'} This is not an assessment of overall program health.</p>
        : rows.slice(0, 5).map(row => <Link key={row.slug} className={styles.item} href={`/dashboard?${new URLSearchParams({brand:row.slug, range:'custom',start,end})}`}>
          <BrandIdentity brand={row.slug} label={labels[row.slug] ?? row.slug} />
          <span className={`${styles.delta} ${row.kind === 'coverage' ? '' : positive ? styles.positive : styles.negative}`}>
            {row.kind === 'coverage' ? 'Check data' : `${row.delta > 0 ? '+' : '−'}${formatCurrency(Math.abs(row.delta))}`}
          </span>
          <p>{row.kind === 'coverage' ? 'One or both periods have days without recorded activity. Confirm data coverage before interpreting a decline.'
            : row.kind === 'new-activity' ? `Recorded GMV rose from $0 to ${formatCurrency(row.current)}. Investigate what started earning; a percentage is not meaningful here.`
            : `GMV ${positive ? 'up' : 'down'} ${Math.abs(row.percent!).toFixed(1)}% · ${formatCurrency(row.previous)} → ${formatCurrency(row.current)}. ${positive ? 'Review the creators and content driving growth.' : 'Review the brand’s performance before deciding on a response.'}`}</p>
        </Link>)}
      {rows.length > 5 && <p className={styles.empty}>Showing 5 of {rows.length}; open Brand performance for the full list.</p>}
    </section>;
  }
  return <div>
    <div className={styles.groups}>{group('Needs attention','Declines and data gaps to investigate',attention,false)}{group('Opportunities','Growth worth understanding and repeating',opportunities,true)}</div>
    <details className={styles.rules}><summary>How these signals are selected</summary>
      GMV changes must be at least 10% and $100 versus the prior equal-length period. Growth from zero must reach $100 and has no percentage. Missing recorded days suppress movement signals; recorded days do not guarantee every file was imported. Changes are ordered by dollar impact, with data checks after declines. These signals identify questions, not causes or profit. Posting, spend-change, and coaching signals will need their own evidence.
    </details>
  </div>;
}
