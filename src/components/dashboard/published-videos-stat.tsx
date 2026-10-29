import 'server-only';
import Link from 'next/link';
import { StatCard } from '@/components/dashboard/stat-card';
import type { PublishedVideoCounts } from '@/lib/data/published-videos';
import { pctChange } from '@/lib/utils/trend';

/** Awaited inside its own boundary so a slow count does not hold other KPIs. */
export async function PublishedVideosStat({ counts, canReviewUploads }: {
  counts: Promise<PublishedVideoCounts | null>;
  canReviewUploads: boolean;
}) {
  const publishedVideos = await counts;
  // Publication coverage is independent of sales coverage. A day with GMV is
  // not evidence that every video was imported, so only compare windows whose
  // known uploads landed and keep all counts explicitly recorded totals.
  const canCompare = Boolean(publishedVideos?.currentComplete && publishedVideos.priorComplete);
  const delta = publishedVideos ? publishedVideos.total - publishedVideos.priorTotal : 0;
  const comparison = delta === 0
    ? 'No change vs prior period'
    : `${Math.abs(delta).toLocaleString('en-US')} ${delta > 0 ? 'more' : 'fewer'} vs prior period`;

  return <StatCard
    label="Videos published"
    value={publishedVideos ? publishedVideos.total.toLocaleString('en-US') : '—'}
    trend={canCompare && publishedVideos && publishedVideos.priorTotal > 0 ? pctChange(publishedVideos.total, publishedVideos.priorTotal) : undefined}
    trendLabel={canCompare ? comparison : undefined}
    detail={publishedVideos?.currentComplete
      ? 'Recorded managed videos'
      : <span>{publishedVideos ? 'Recorded total' : 'Video total unavailable'}{canReviewUploads
          ? <> · <Link href="/upload" className="underline decoration-dotted underline-offset-4 hover:text-foreground">Check coverage</Link></>
          : publishedVideos ? ' · coverage incomplete' : null}</span>}
    info="Recorded unique videos published by your managed creators in the selected dates, including videos with no sales. Repeat daily sales and product rows count once. Trends appear only when all known upload rows landed in both periods. This does not independently confirm that TikTok exported every video; missing source data can make the recorded count lower."
  />;
}
