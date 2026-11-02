import { formatCurrency } from '@/lib/utils/format';
import styles from './managed-share.module.css';

/** Affiliate sales attributable to managed creators, with change in percentage points. */
export function ManagedOrganicDonut({ managed, organic, prevManaged, prevTotal }: {
  managed: number; organic: number; prevManaged?: number; prevTotal?: number;
}) {
  const total = managed + organic;
  const share = total > 0 ? managed / total * 100 : null;
  const previous = prevManaged != null && prevTotal != null && prevTotal > 0 ? prevManaged / prevTotal * 100 : null;
  const delta = share != null && previous != null ? share - previous : null;
  return <div className={styles.share}>
    <p className={styles.value}>{share == null ? 'Unavailable' : `${share.toFixed(1)}%`}</p>
    {delta != null && <p className={delta >= 0 ? styles.positive : styles.negative}>{delta >= 0 ? '+' : '−'}{Math.abs(delta).toFixed(1)} percentage {Math.abs(delta).toFixed(1) === '1.0' ? 'point' : 'points'} vs prior period</p>}
    {share != null && <div className={styles.track} role="meter" aria-label="Managed share of affiliate GMV" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, share))} aria-valuetext={`${share.toFixed(1)}% of recorded affiliate GMV`}><span style={{ width: `${Math.min(100, Math.max(0, share))}%` }} /></div>}
    <p className={styles.amounts}>{formatCurrency(managed)} of {formatCurrency(total)} total affiliate GMV</p>
    <p className={styles.note}>Sales attributed to managed creators within this brand scope.</p>
  </div>;
}
