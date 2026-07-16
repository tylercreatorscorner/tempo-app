import { PageHeaderSkeleton, KpiStripSkeleton, ChartSkeleton, TableSkeleton } from '@/components/ui/page-skeletons';

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <KpiStripSkeleton count={4} />
      <ChartSkeleton />
      <TableSkeleton rows={8} cols={5} />
    </div>
  );
}
