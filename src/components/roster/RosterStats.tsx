'use client';

import styles from './roster-layout.module.css';
import { MetricGrid } from '@/components/ui/metric-grid';
import { StatCard } from '@/components/ui/stat-card';

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
    { label: 'Retainer budget', value: value(retainerBudget, true), detail: 'Current recorded monthly commitments', info: 'Current recorded monthly retainer amounts for the selected brands. This is not prorated period spend or an approved payout. Creators without a recorded rate are excluded and identified below.', partial: !loading && retainerBudget != null && !retainerComplete },
    { label: 'Managed GMV', value: value(managedGmv, true), detail: periodLabel, info: 'Recorded GMV attributed to managed creators for the selected brands and dates, respecting reporting start and archive dates. Partial totals are labeled when source coverage is incomplete.', partial: !loading && managedGmv != null && !gmvComplete },
    { label: 'Videos published', value: value(videosPublished), detail: periodLabel, info: 'Recorded unique videos published by managed creators in the selected dates, including videos with no sales. Repeated daily and product rows count once. Missing source data can make this recorded count lower than the actual total.', partial: !loading && videosPublished != null && !videosComplete },
  ];
  return <section className={styles.stats} aria-label="Managed creator totals" aria-busy={loading || refreshing}>
    <div className={styles.statsHeading}>
      <p>Managed creators <span>· {brandLabel}</span></p>
      {(stale || refreshing) && <span role="status">{stale ? 'Last loaded totals · refresh failed' : 'Updating totals…'}</span>}
    </div>
    <MetricGrid columns={3} label="Creator KPI cards">
      {metrics.map(metric => <StatCard
        key={metric.label}
        label={metric.label}
        value={metric.value}
        info={metric.info}
        state={loading ? 'loading' : metric.value === 'Unavailable' ? 'unavailable' : 'ready'}
        detail={<>{metric.detail}{metric.partial && <><br /><strong className="font-medium">{metric.label === 'Retainer budget' ? 'Partial recorded terms' : 'Partial recorded data'}</strong></>}</>}
      />)}
    </MetricGrid>
    {metrics[0].partial && <p className={styles.statsCoverage}>Retainer budget excludes {retainerMissingCount != null && retainerMissingCount > 0 ? `${count.format(retainerMissingCount)} ${retainerMissingCount === 1 ? 'creator' : 'creators'}` : 'creators'} without a recorded rate.</p>}
    {metrics.slice(1).some(metric => metric.partial) && <p className={styles.statsCoverage}>Some selected dates or brands have missing source data. Partial figures show recorded data only.</p>}
  </section>;
}
