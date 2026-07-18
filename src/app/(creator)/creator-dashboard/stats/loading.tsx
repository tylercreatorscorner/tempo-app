import { PageHeaderSkeleton, KpiStripSkeleton, ChartSkeleton, TableSkeleton } from '@/components/ui/page-skeletons';

export default function Loading() {
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <PageHeaderSkeleton />
      <KpiStripSkeleton count={4} />
      <ChartSkeleton />
      <TableSkeleton rows={10} cols={5} />
    </div>
  );
}
