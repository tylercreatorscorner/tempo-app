import { Skeleton } from '@/components/ui/skeleton';
import { PageHeaderSkeleton, KpiStripSkeleton } from '@/components/ui/page-skeletons';
import layout from '@/components/ui/workspace-layout.module.css';

export default function Loading() {
  return (
    <div className={layout.page}>
      <PageHeaderSkeleton />
      <KpiStripSkeleton count={4} className={layout.cardMetrics} />
      {/* Cohort heatmap */}
      <div className={layout.columns}><Skeleton className="h-[420px] rounded-xl" /><Skeleton className="h-56 rounded-xl" /></div>
    </div>
  );
}
