import { Skeleton } from '@/components/ui/skeleton';
import { KpiStripSkeleton, TableSkeleton } from '@/components/ui/page-skeletons';

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Profile header — avatar + name/handle + badges */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-36" />
        </div>
      </div>
      <KpiStripSkeleton count={4} />
      <TableSkeleton rows={8} cols={4} />
    </div>
  );
}
