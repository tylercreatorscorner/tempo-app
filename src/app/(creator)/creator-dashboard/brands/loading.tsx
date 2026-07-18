import { PageHeaderSkeleton, KpiStripSkeleton, TableSkeleton } from '@/components/ui/page-skeletons';

export default function Loading() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <PageHeaderSkeleton />
      <KpiStripSkeleton count={4} />
      <TableSkeleton rows={5} cols={4} />
    </div>
  );
}
