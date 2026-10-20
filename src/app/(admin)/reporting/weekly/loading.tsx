import styles from './workspace.module.css';
import { PageHeaderSkeleton } from '@/components/ui/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The week's metrics come from one RPC per brand (~5s for a full portfolio
 * week), so this page is slow enough that a blank screen would read as broken.
 * One collapsed row per brand, matching the real layout.
 */
export default function Loading() {
  return (
    <div className={styles.page}>
      <PageHeaderSkeleton />
      <div className={styles.layout}><div className={styles.forms}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-3/4 max-w-64" />
              </div>
              <Skeleton className="h-4 w-4 rounded" />
            </div>
          </div>
        ))}
      </div><Skeleton className="h-60 w-full rounded-xl" /></div>
    </div>
  );
}
