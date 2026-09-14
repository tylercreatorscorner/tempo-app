import { getCreatorPerformanceHistory } from '@/lib/data/creator-performance-history';
import { CreatorPerformanceTimeline } from './performance-timeline';

export async function ProfilePerformanceHistory({ creatorId, start, end, brand, label }: {
  creatorId: string; start: string; end: string; brand?: string; label: string;
}) {
  const history = await getCreatorPerformanceHistory(creatorId, start, end, brand);
  if (history.status === 'denied') return null;
  if (history.status !== 'ready') return <p role="status" className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
    {history.status === 'range' ? 'Select up to 366 days to view performance history.' : 'Performance history is unavailable right now. Your other profile information is still available.'}
  </p>;
  return <CreatorPerformanceTimeline key={`${creatorId}:${brand ?? 'authorized'}:${start}:${end}`}
    points={history.points} scopeLabel={`${label} · ${start}–${end}`}
    title="Recorded performance" gmvLabel="Recorded GMV" postsLabel="Tracked posts published"
    sourceNote="Based on imported daily sales and tracked publication records. Imports may be incomplete; missing days are not treated as zero. Multi-brand publications count each tracked video once. Publication tracking refreshes separately from sales." />;
}
