import { PageHeaderSkeleton, KpiStripSkeleton, TableSkeleton } from '@/components/ui/page-skeletons';

export default function Loading() {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton />
      <KpiStripSkeleton count={4} />
      <TableSkeleton rows={8} cols={6} />
    </div>
  );
}
