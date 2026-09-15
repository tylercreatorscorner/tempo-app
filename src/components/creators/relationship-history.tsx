import { getCreatorPerformanceHistory } from '@/lib/data/creator-performance-history';
import { CreatorPerformanceTimeline } from './performance/performance-timeline';
import styles from './profile-workspace.module.css';

export async function RelationshipHistory({ creatorId, brand, end, label, compact = false }: { creatorId: string; brand?: string; end: string; label: string; compact?: boolean }) {
  // Twelve calendar months, with the current month explicitly partial.
  const from = new Date(`${end.slice(0, 7)}-01T00:00:00Z`);
  from.setUTCMonth(from.getUTCMonth() - 11);
  const start = from.toISOString().slice(0, 10);
  const history = await getCreatorPerformanceHistory(creatorId, start, end, brand);
  if (history.status !== 'ready') return <div className={styles.empty}>Relationship history is unavailable right now. Your current profile and agreements remain available.</div>;
  const rows = history.points;
  if (!rows.length) return <div className={styles.empty}>No recorded performance history for this relationship yet.</div>;
  const money = (n: number | null) => n === null ? 'Unavailable' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  return <div className={styles.stack}>
    {!compact && <CreatorPerformanceTimeline availablePeriodsOnly points={rows} title="The relationship over time" scopeLabel={`${label} · ${start}–${end}`} gmvLabel="GMV in available months" postsLabel="Publications in available months" sourceNote="Subtotals include only months with complete records for that metric. Months with missing days remain gaps, not zeros; GMV and publication coverage may differ. The current month ends on the displayed date. Publications are not verified agreement deliveries." />}
    <details open={compact} className={styles.section}><summary className="cursor-pointer px-6 py-4 text-sm font-medium">{compact ? "Recent months for renewal review" : "Monthly performance records"}</summary>
      <div className={styles.sectionHead}><div><h2>{compact ? "Renewal evidence" : "Month by month"}</h2><p>{compact ? "Recorded performance for renewal review. Historical agreed fees and accepted deliveries are not yet available by month." : "Sales and posting activity across the last twelve months."}</p></div><span className={styles.eyebrow}>{label}</span></div>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Month</th><th>Recorded GMV</th><th>Published</th><th>Sales coverage</th></tr></thead><tbody>
        {[...rows].reverse().slice(0,compact ? 3 : 12).map(row => <tr key={row.key}><td data-label="Month">{row.axisLabel}{row.key === end.slice(0, 7) && <small>Through {end}</small>}</td><td data-label="Recorded GMV">{money(row.gmv)}</td><td data-label="Published">{row.posts ?? 'Unavailable'}</td><td data-label="Sales coverage">{row.gmv === null ? 'Missing daily records' : 'Recorded window'}</td></tr>)}
      </tbody></table></div>
    </details>
  </div>;
}

