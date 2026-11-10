import Link from 'next/link';
import { CreatorPortrait } from '@/components/creators/creator-portrait';
import { formatCurrency } from '@/lib/utils/format';
import type { Contributor } from '@/lib/data/dashboard-contributors';
import styles from './dashboard-drivers.module.css';

export function GmvContributors({ rows, available, brand, coverage, start, end }: { rows: Contributor[]; available: boolean; brand: string | null; coverage: string; start: string; end: string }) {
  const params = new URLSearchParams({ range: 'custom', start, end });
  if (brand) params.set('brand', brand);
  return <section className={styles.panel} aria-label="Managed GMV contributors">
    <header className={styles.contributorHeader}><h2>What drove managed GMV</h2><p>{coverage} · change vs prior period</p></header>
    {!available ? <p className={styles.empty}>Creator comparisons will appear when both periods have recorded daily coverage.</p>
      : !rows.length ? <p className={styles.empty}>No managed creator changes of $1 or more in this period.</p>
      : <div>{rows.slice(0, 3).map(row => <Link key={row.key} href={`/creators/${encodeURIComponent(row.id ?? row.handle)}?${params}`} className={styles.contributor}>
        <CreatorPortrait creatorId={row.id} name={row.name} className={styles.portrait} />
        <span className={styles.contributorIdentity}><strong>{row.name}</strong><span>Prior {formatCurrency(row.previous)} · Current {formatCurrency(row.current)}</span></span>
        <strong className={`${styles.contributorDelta} ${row.delta >= 0 ? styles.positive : styles.negative}`}>{row.delta >= 0 ? '+' : '−'}{formatCurrency(Math.abs(row.delta))}</strong>
      </Link>)}</div>}
  </section>;
}
