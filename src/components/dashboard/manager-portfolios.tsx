import Link from 'next/link';
import { CreatorPortrait } from '@/components/creators/creator-portrait';
import { BrandIdentity } from '@/components/creators/brand-identity';
import { formatCurrency } from '@/lib/utils/format';
import type { DashboardManager } from '@/lib/data/dashboard-managers';
import type { DashboardSignal } from '@/lib/data/dashboard-signals';
import type { BrandRowData } from './brand-performance';
import styles from './manager-portfolios.module.css';

export function ManagerPortfolios({ managers, brands, labels, signals, start, end, totalsAvailable }: {
  managers: DashboardManager[] | null;
  brands: BrandRowData[];
  labels: Record<string,string>;
  signals: { attention: DashboardSignal[]; opportunities: DashboardSignal[]; available: boolean };
  start: string; end: string; totalsAvailable: boolean;
}) {
  return <section className={styles.section} aria-label="Manager portfolios">
    <header className={styles.header}><div><h2>Manager portfolios</h2><p>{start} – {end} · Current assignments · Authorized brands only</p></div><span className={styles.internal}>Internal review</span></header>
    <p className={styles.hint}>Open a manager to review their brands. Changes compare the prior equal-length period; portfolio size is not a performance ranking.</p>
    <div className={styles.columns} aria-hidden="true"><span>Manager / brands</span><span>Total GMV / change</span><span>Managed GMV / share</span><span>Review</span><span/></div>
    {managers === null ? <p className={styles.hint}>Manager assignments could not be loaded. Try again shortly.</p> : managers.length === 0 ? <p className={styles.hint}>No authorized brand portfolios to display.</p> : managers.map(manager => {
      const rows = brands.filter(row => manager.brands.includes(row.slug));
      const total = rows.reduce((sum,row) => sum + row.currentGmv,0);
      const prior = rows.reduce((sum,row) => sum + row.prevGmv,0);
      const priorManaged = rows.reduce((sum,row) => sum + row.prevManagedGmv,0);
      const managed = rows.reduce((sum,row) => sum + row.managedGmv,0);
      const checks = signals.attention.filter(row => manager.brands.includes(row.slug) && row.kind === 'coverage');
      const attention = signals.attention.filter(row => manager.brands.includes(row.slug) && row.kind !== 'coverage');
      const opportunities = signals.opportunities.filter(row => manager.brands.includes(row.slug));
      const comparable = totalsAvailable && signals.available && checks.length === 0;
      const delta = total - prior;
      const managedDelta = managed - priorManaged;
      return <details key={manager.id} className={styles.manager}>
        <summary><div className={styles.identity}><CreatorPortrait name={manager.name} source={manager.avatar} className={styles.portrait}/><div><strong>{manager.name}</strong><span>{rows.length} brand{rows.length === 1 ? '' : 's'}</span></div></div>
          <div className={styles.metric}><span>Total GMV</span><strong>{totalsAvailable ? formatCurrency(total) : '—'}</strong><small className={comparable ? delta >= 0 ? styles.positive : styles.negative : undefined}>{comparable ? `${delta >= 0 ? '+' : '−'}${formatCurrency(Math.abs(delta))}${prior > 0 ? ` (${(delta / prior * 100).toFixed(1)}%)` : ' · from $0'}` : 'Comparison unavailable'}</small></div>
          <div className={styles.metric}><span>Managed GMV</span><strong>{formatCurrency(managed)}</strong><small className={comparable ? managedDelta >= 0 ? styles.positive : styles.negative : undefined}>{comparable ? `${managedDelta >= 0 ? '+' : '−'}${formatCurrency(Math.abs(managedDelta))}${priorManaged > 0 ? ` (${(managedDelta/priorManaged*100).toFixed(1)}%)` : ' · from $0'}` : 'Comparison unavailable'}</small><small>{totalsAvailable && total > 0 ? `${(managed / total * 100).toFixed(1)}% of total` : 'Share unavailable'}</small></div>
          <div className={styles.discussion}>{attention[0] ? <span>Review {labels[attention[0].slug] ?? attention[0].slug}<br/><span className={styles.negative}>{formatCurrency(Math.abs(attention[0].delta))} GMV decline</span></span> : <span className="text-muted-foreground">Open brand breakdown</span>}</div><span className={styles.chevron} aria-hidden="true">⌄</span>
        </summary>
        <div className={styles.brands}>{rows.map(row => {
          const signal = [...checks,...attention,...opportunities].find(signal => signal.slug === row.slug);
          return <Link key={row.slug} href={`/dashboard?${new URLSearchParams({brand:row.slug,range:'custom',start,end})}`}><BrandIdentity brand={row.slug} label={labels[row.slug] ?? row.slug}/><span className={styles.brandSignal}>{!signals.available ? 'Signals unavailable' : signal?.kind === 'coverage' ? 'Check data coverage' : signal?.kind === 'decline' ? 'GMV declining' : signal ? 'GMV growing' : 'No movement signal'}</span><strong>{totalsAvailable ? formatCurrency(row.currentGmv) : '—'}</strong><span aria-hidden="true">↗</span></Link>;
        })}</div>
      </details>;
    })}
  </section>;
}
