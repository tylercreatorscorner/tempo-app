import { PageHeaderSkeleton, TableSkeleton } from '@/components/ui/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton />
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3"><Skeleton className="h-9 w-72 max-w-full"/><Skeleton className="h-9 w-56 max-w-full"/></div>
        <TableSkeleton rows={7} cols={4} title={false} />
      </div>
    </div>
  );
}
