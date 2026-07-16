import { PageHeaderSkeleton, KpiStripSkeleton, TableSkeleton } from '@/components/ui/page-skeletons';

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <KpiStripSkeleton count={5} className="grid grid-cols-2 lg:grid-cols-5 gap-4" />
      <TableSkeleton rows={10} cols={6} />
    </div>
  );
}
