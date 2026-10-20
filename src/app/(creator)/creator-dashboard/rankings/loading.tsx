import portal from '@/components/layout/portal-workspace.module.css';
import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/components/ui/page-skeletons';

/** Mirrors the Ledger Rankings: header, standing band, leaderboard + top-videos split. */
export default function Loading() {
  return (
    <div className={portal.page}>
      {/* Header + range chip */}
      <div className={portal.pageHeader}>
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-8 w-80 max-w-full" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-36 rounded-full" />
      </div>

      {/* Standing band */}
      <div className={portal.standing}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2.5 bg-card p-3.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-20" />
          </div>
        ))}
      </div>

      {/* Leaderboard + top videos */}
      <div className={portal.split}>
        <TableSkeleton rows={10} cols={4} />
        <Skeleton className="h-[460px] rounded-2xl" />
      </div>
    </div>
  );
}
