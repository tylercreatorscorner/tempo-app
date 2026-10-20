import { PageHeaderSkeleton, KpiStripSkeleton, ChartSkeleton } from '@/components/ui/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import styles from '../brands.module.css';

export default function Loading() {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton />
      <KpiStripSkeleton count={5} />
      <div className={styles.overview}><ChartSkeleton /><div className="space-y-3 rounded-xl border border-border bg-card p-4"><Skeleton className="h-4 w-32"/><Skeleton className="h-24 w-full"/><Skeleton className="h-8 w-24"/></div></div>
    </div>
  );
}
