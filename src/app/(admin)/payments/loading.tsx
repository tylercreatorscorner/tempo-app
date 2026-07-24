import { PageHeaderSkeleton, KpiStripSkeleton, ChartSkeleton, TableSkeleton } from '@/components/ui/page-skeletons';

/** Mirrors the Payments page: header, 4 KPIs, brand chart, retainer book. */
export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <KpiStripSkeleton count={4} className="grid grid-cols-2 lg:grid-cols-4 gap-3" />
      <ChartSkeleton />
      <TableSkeleton rows={8} cols={5} />
    </div>
  );
}
