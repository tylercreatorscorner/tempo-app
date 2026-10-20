import Link from 'next/link';
import { CreatorPortrait } from '@/components/creators/creator-portrait';
import { formatCurrency } from '@/lib/utils/format';
import type { Contributor } from '@/lib/data/dashboard-contributors';
import styles from './morning-review.module.css';

export function GmvContributors({ rows, available, brand, coverage, start, end }: { rows: Contributor[]; available: boolean; brand: string | null; coverage: string; start: string; end: string }) {
  const params = new URLSearchParams({ range: 'custom', start, end });
  if (brand) params.set('brand', brand);
  return <section className={styles.contributors} aria-label="Managed GMV contributors">
    <header className={styles.contributorsHeader}><h2>Managed GMV contributors</h2><p>{coverage} · change vs prior period</p></header>
    {!available ? <p className={styles.contributorEmpty}>Creator comparisons will appear when both periods have recorded daily coverage.</p> : !rows.length ? <p className={styles.contributorEmpty}>No managed creator changes of $1 or more in this period.</p> : <div>{rows.slice(0,3).map(row => <Link key={row.key} href={`/creators/${encodeURIComponent(row.id ?? row.handle)}?${params}`} className={styles.contributor}>
      <CreatorPortrait creatorId={row.id} name={row.name} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-secondary object-cover text-xs"/>
      <div><p className="truncate text-xs font-medium">{row.name}</p><small>Prior {formatCurrency(row.previous)} · Current {formatCurrency(row.current)}</small></div><strong style={{color:row.delta >= 0 ? 'var(--pulse-pos)' : 'var(--pulse-neg)'}}>{row.delta >= 0 ? '+' : '−'}{formatCurrency(Math.abs(row.delta))}</strong>
    </Link>)}</div>}
  </section>;
}
