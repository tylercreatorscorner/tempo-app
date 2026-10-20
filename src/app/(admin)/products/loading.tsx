import { PageHeaderSkeleton, TableSkeleton, KpiStripSkeleton } from '@/components/ui/page-skeletons';
import layout from '@/components/ui/workspace-layout.module.css';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className={layout.page}>
      <PageHeaderSkeleton />
      <KpiStripSkeleton count={4} className={layout.cardMetrics} />
      <div className={layout.columns}><TableSkeleton rows={10} cols={5} /><Skeleton className="h-80 rounded-xl" /></div>
    </div>
  );
}
