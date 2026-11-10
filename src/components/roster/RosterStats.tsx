'use client';

import styles from './roster-layout.module.css';

type Props = {
  retainerBudget: number | null;
  managedGmv: number | null;
  videosPublished: number | null;
  retainerComplete: boolean;
  retainerMissingCount: number | null;
  gmvComplete: boolean;
  videosComplete: boolean;
  brandLabel: string;
  periodLabel: string;
  loading?: boolean;
  refreshing?: boolean;
  stale?: boolean;
};

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const count = new Intl.NumberFormat('en-US');

/** Authorized brand aggregates supplied by the API, never sums of the visible page. */
export function RosterStats({ retainerBudget, managedGmv, videosPublished, retainerComplete, retainerMissingCount, gmvComplete, videosComplete, brandLabel, periodLabel, loading = false, refreshing = false, stale = false }: Props) {
  const value = (amount: number | null, money = false) => loading ? 'Loading…'
    : amount == null || !Number.isFinite(amount) ? 'Unavailable'
    : money ? currency.format(amount) : count.format(amount);
  const metrics = [
    { label: 'Retainer budget', value: value(retainerBudget, true), detail: 'Current recorded monthly commitments', partial: !loading && retainerBudget != null && !retainerComplete },
    { label: 'Managed GMV', value: value(managedGmv, true), detail: periodLabel, partial: !loading && managedGmv != null && !gmvComplete },
    { label: 'Videos published', value: value(videosPublished), detail: periodLabel, partial: !loading && videosPublished != null && !videosComplete },
  ];
  return <section className={styles.stats} aria-label="Managed creator totals" aria-busy={loading || refreshing}>
    <div className={styles.statsHeading}>
      <p>Managed creators <span>· {brandLabel}</span></p>
      {(stale || refreshing) && <span role="status">{stale ? 'Last loaded totals · refresh failed' : 'Updating totals…'}</span>}
    </div>
    <dl className={styles.statsGrid}>
      {metrics.map(metric => <div className={styles.stat} key={metric.label}>
        <dt>{metric.label}<span>{metric.detail}</span>{metric.partial && <small>{metric.label === 'Retainer budget' ? 'Partial recorded terms' : 'Partial recorded data'}</small>}</dt>
        <dd data-unavailable={metric.value === 'Unavailable' || metric.value === 'Loading…' || undefined}>{metric.value}</dd>
      </div>)}
    </dl>
    {metrics[0].partial && <p className={styles.statsCoverage}>Retainer budget excludes {retainerMissingCount != null && retainerMissingCount > 0 ? `${count.format(retainerMissingCount)} ${retainerMissingCount === 1 ? 'creator' : 'creators'}` : 'creators'} without a recorded rate.</p>}
    {metrics.slice(1).some(metric => metric.partial) && <p className={styles.statsCoverage}>Some selected dates or brands have missing source data. Partial figures show recorded data only.</p>}
  </section>;
}
