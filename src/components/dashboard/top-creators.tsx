import { InterfaceIcon } from '@/components/ui/interface-icon';
import { CreatorPortrait } from '@/components/creators/creator-portrait';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils/format';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import styles from './dashboard-drivers.module.css';

export interface TopCreatorRow {
  name: string | null;
  id?: string;
  handle: string;
  gmv: number;
}

export function TopCreators({ creators, label, brand, start, end }: { creators: TopCreatorRow[]; label: string; brand?: string | null; start?: string; end?: string }) {
  const params = new URLSearchParams();
  if (brand) params.set('brand', brand);
  if (start && end) { params.set('range', 'custom'); params.set('start', start); params.set('end', end); }
  const suffix = params.size ? `?${params}` : '';
  const rows = creators.map((creator, index) => {
    const display = creator.name ?? `@${creator.handle}`;
    return <Link key={`${creator.id ?? creator.handle}-${index}`} href={`/creators/${encodeURIComponent(creator.id ?? creator.handle)}${suffix}`} className={styles.creator}>
      <CreatorPortrait creatorId={creator.id} name={display} className={styles.portrait} />
      <span className={styles.creatorIdentity}><strong>{display}</strong><span>@{creator.handle}</span></span>
      <strong className={styles.creatorGmv}>{formatCurrency(creator.gmv)}</strong>
    </Link>;
  });
  return <Card className={styles.panel}>
    <CardHeader className={styles.header}>
      <CardTitle className={styles.title}>Top creators</CardTitle>
      <Link href={`/roster${suffix}`} className={styles.headerLink}>View roster <InterfaceIcon name="forward" /></Link>
    </CardHeader>
    {creators.length === 0 ? <p className={styles.empty}>No managed creator GMV in this period.</p> : <div>
      {rows.slice(0, 4)}
      {rows.length > 4 && <details className={styles.more}><summary>Show {rows.length - 4} more creators</summary><div>{rows.slice(4)}</div></details>}
    </div>}
    <p className={styles.footnote}>Managed creator GMV · {label} selected period</p>
  </Card>;
}
