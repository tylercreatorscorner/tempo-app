import { PageHeaderSkeleton, TableSkeleton } from '@/components/ui/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start">
        {/* Create panel — hidden below xl, matching the closed-by-default panel */}
        <div className="hidden xl:block xl:col-start-2 xl:row-start-1">
          <Skeleton className="h-[440px] rounded-xl" />
        </div>
        <div className="space-y-8 xl:col-start-1 xl:row-start-1">
          {/* Sent feed */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-4 w-72" />
            </div>
            <TableSkeleton rows={6} cols={6} title={false} />
          </div>
          {/* Scheduled strip */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-64" />
            </div>
            <TableSkeleton rows={3} cols={7} title={false} />
          </div>
        </div>
      </div>
    </div>
  );
}
