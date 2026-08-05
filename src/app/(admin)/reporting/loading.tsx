import { PageHeaderSkeleton, TableSkeleton } from '@/components/ui/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="space-y-8">
        {/* Client reporting table — the primary surface. Full width, because
            the Create panel only appears once a brand is chosen. */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-80" />
          </div>
          <TableSkeleton rows={7} cols={6} title={false} />
        </div>
        {/* Recent activity */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-72" />
          </div>
          <TableSkeleton rows={5} cols={6} title={false} />
        </div>
      </div>
    </div>
  );
}
