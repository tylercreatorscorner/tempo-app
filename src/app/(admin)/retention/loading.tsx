import { Skeleton } from '@/components/ui/skeleton';
import { PageHeaderSkeleton, KpiStripSkeleton } from '@/components/ui/page-skeletons';

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <KpiStripSkeleton count={4} />
      {/* Cohort heatmap */}
      <Skeleton className="h-[420px] rounded-[20px]" />
    </div>
  );
}
