import { Skeleton } from '@/components/ui/skeleton';
import { ChartLoading, LoadingStatus } from '@/components/ui/loading-status';
import styles from '@/components/dashboard/dashboard-studio.module.css';

/** Reserve the same regions as the dashboard instead of flashing an older UI. */
export default function Loading() {
  return <div className={styles.page} aria-busy="true">
    <header className={styles.heading}>
      <div><h1>Brand workspace</h1><p>Your brands, creators, and what is moving.</p></div>
      <LoadingStatus label="Loading dashboard" detail="Preparing your selected brands and dates" />
    </header>
    <div className={styles.toolbar} aria-hidden="true"><Skeleton className="h-9 w-40"/><Skeleton className="h-9 w-56"/></div>
    <section className={styles.metrics} aria-label="Loading performance metrics">
      {Array.from({length:6},(_,i)=><div key={i} className="space-y-2" aria-hidden="true"><Skeleton className="h-3 w-24 max-w-full"/><Skeleton className="h-8 w-28 max-w-full"/><Skeleton className="h-3 w-24 max-w-full"/></div>)}
    </section>
    <div className={styles.trendGrid}>
      <div className={styles.skeletonCard}><ChartLoading label="Loading performance"/></div>
      <div className={styles.skeletonCard} aria-hidden="true"><Skeleton className="h-5 w-32"/><Skeleton className="h-14 w-40"/><Skeleton className="h-2 w-full"/><Skeleton className="h-4 w-48 max-w-full"/></div>
    </div>
    <div className={styles.skeletonCard} aria-hidden="true"><Skeleton className="h-5 w-44"/>{[0,1,2,3].map(i=><Skeleton key={i} className="h-10 w-full"/>)}</div>
  </div>;
}
