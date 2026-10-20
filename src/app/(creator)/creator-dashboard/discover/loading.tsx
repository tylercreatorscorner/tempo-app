import portal from '@/components/layout/portal-workspace.module.css';
import { Skeleton } from '@/components/ui/skeleton';
import { CardGridSkeleton } from '@/components/ui/page-skeletons';

/** Mirrors the Ledger Inspiration page: header, filters, cover-card grid. */
export default function Loading() {
  return (
    <div className={portal.page}>
      <div className={portal.pageHeader}>
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-8 w-80 max-w-full" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-36 rounded-full" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-10 min-w-0 flex-1 rounded-lg" />
        <Skeleton className="h-6 w-32 rounded-full" />
      </div>
      <CardGridSkeleton
        count={9}
        height="h-44"
        className={portal.videoGrid}
      />
    </div>
  );
}
