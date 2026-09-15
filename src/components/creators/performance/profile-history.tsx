import { getCreatorPerformanceHistory } from '@/lib/data/creator-performance-history';
import { CreatorPerformanceTimeline } from './performance-timeline';
import { total } from './model';
import styles from '../profile-workspace.module.css';

export async function ProfilePerformanceHistory({ creatorId, start, end, brand, label, compare = false }: {
  creatorId: string; start: string; end: string; brand?: string; label: string; compare?: boolean;
}) {
  const startMs = Date.parse(`${start}T00:00:00Z`), endMs = Date.parse(`${end}T00:00:00Z`);
  const duration = endMs - startMs + 86400000;
  const canCompare = compare && Number.isFinite(duration) && duration > 0 && duration <= 366 * 86400000;
  const previousStart = canCompare ? new Date(startMs - duration).toISOString().slice(0,10) : '';
  const previousEnd = canCompare ? new Date(startMs - 86400000).toISOString().slice(0,10) : '';
  const [history, previous] = await Promise.all([
    getCreatorPerformanceHistory(creatorId, start, end, brand),
    canCompare ? getCreatorPerformanceHistory(creatorId, previousStart, previousEnd, brand) : Promise.resolve(null),
  ]);
  if (history.status === 'denied') return null;
  if (history.status !== 'ready') return <p role="status" className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
    {history.status === 'range' ? 'Select up to 366 days to view performance history.' : 'Performance history is unavailable right now. Your other profile information is still available.'}
  </p>;
  const currentGmv = total(history.points, 'gmv');
  const previousGmv = previous?.status === 'ready' ? total(previous.points, 'gmv') : null;
  const change = currentGmv !== null && previousGmv !== null && previousGmv > 0 ? (currentGmv - previousGmv) / previousGmv * 100 : null;
  const delta = currentGmv !== null && previousGmv !== null ? currentGmv-previousGmv : null;
  const money = (value:number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
  return <div>{canCompare && <div className={styles.comparison} aria-label="Previous-period comparison">
    <span>GMV change</span>
    {delta !== null ? <><strong>{delta>0?'+':''}{money(delta)} {change !== null && `(${change>0?'+':''}${change.toFixed(1)}%)`}</strong><span>vs. {previousStart}–{previousEnd} · previous GMV {money(previousGmv!)}{previousGmv===0 && ' · percentage comparison is not defined for a zero baseline'}</span></> : <span>Comparison unavailable: one or both periods lack complete sales records.</span>}
  </div>}<CreatorPerformanceTimeline key={`${creatorId}:${brand ?? 'authorized'}:${start}:${end}`}
    points={history.points} scopeLabel={`${label} · ${start}–${end}`}
    title="Recorded performance" gmvLabel="Recorded GMV" postsLabel="Tracked posts published"
    sourceNote="Based on imported daily sales and tracked publication records. Imports may be incomplete; missing days are not treated as zero. Multi-brand publications count each tracked video once. Publication tracking refreshes separately from sales." /></div>;
}
