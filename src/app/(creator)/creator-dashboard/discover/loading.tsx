import { Skeleton } from '@/components/ui/skeleton';
import { CardGridSkeleton } from '@/components/ui/page-skeletons';

/** Mirrors the Ledger Inspiration page: header, filters, cover-card grid. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-8 w-80 max-w-full" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-36 rounded-full" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 min-w-[240px] flex-1 rounded-lg" />
        <Skeleton className="h-6 w-32 rounded-full" />
      </div>
      <CardGridSkeleton
        count={9}
        height="h-72"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      />
    </div>
  );
}
