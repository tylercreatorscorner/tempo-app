import { PageHeaderSkeleton, KpiStripSkeleton, ChartSkeleton } from '@/components/ui/page-skeletons';

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <KpiStripSkeleton count={4} />
      <ChartSkeleton />
    </div>
  );
}
