import { PageHeaderSkeleton, KpiStripSkeleton, TableSkeleton } from '@/components/ui/page-skeletons';

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <KpiStripSkeleton count={3} className="grid gap-3 md:grid-cols-3" />
      <TableSkeleton rows={9} cols={6} />
    </div>
  );
}
