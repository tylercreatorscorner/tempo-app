import { Skeleton } from '@/components/ui/skeleton';
import { ChartLoading, LoadingStatus } from '@/components/ui/loading-status';
import styles from '@/components/dashboard/morning-review.module.css';

/** Match the released dashboard so loading doesn't resurrect the old layout. */
export default function Loading() {
  return <div className="space-y-4" aria-busy="true">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-primary">Brand portfolio</p>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1></div>
      <LoadingStatus label="Loading dashboard" detail="Preparing your workspace overview" />
    </div>
    <div className={styles.metrics} aria-hidden="true">
      {Array.from({ length:5 }, (_,i) => <div key={i} className="space-y-2">
        <Skeleton className="h-3 w-24 max-w-full" /><Skeleton className="h-7 w-28 max-w-full" /><Skeleton className="h-3 w-20" />
      </div>)}
    </div>
    <div className={styles.commitments} aria-hidden="true"><Skeleton className="h-4 w-56"/><Skeleton className="h-4 w-44"/></div>
    <div className={styles.workspace}>
      <div className={styles.primary}><div className="rounded-xl border border-border bg-card p-4"><ChartLoading label="Loading performance" /></div><div className="space-y-3 rounded-xl border border-border bg-card p-4" aria-hidden="true">{[0,1,2,3].map(i=><Skeleton key={i} className="h-10 w-full"/>)}</div></div>
      <div className={styles.aside} aria-hidden="true">{[0,1,2].map(i=><div key={i} className="space-y-3 rounded-xl border border-border bg-card p-4"><Skeleton className="h-4 w-28" /><Skeleton className="h-8 w-20" /><Skeleton className="h-2 w-full" /></div>)}</div>
    </div>
  </div>;
}
