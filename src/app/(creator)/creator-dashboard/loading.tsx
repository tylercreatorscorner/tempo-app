import {
  PageHeaderSkeleton,
  KpiStripSkeleton,
  TableSkeleton,
} from '@/components/ui/page-skeletons';

/**
 * Route skeleton for the creator Home. Mirrors the real page shape (header +
 * KPI strip + two video cards) so nothing jumps on commit while the server
 * fetches the creator's summary / streak / top-videos.
 */
export default function Loading() {
  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <PageHeaderSkeleton />
      <KpiStripSkeleton count={4} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TableSkeleton rows={5} cols={2} />
        <TableSkeleton rows={5} cols={2} />
      </div>
    </div>
  );
}
