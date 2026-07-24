import { PageHeaderSkeleton, KpiStripSkeleton, TableSkeleton } from '@/components/ui/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      {/* Toolbar: view tabs + month/payee pickers + run button */}
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-36 rounded-md" />
        <Skeleton className="h-9 w-44 rounded-md" />
        <Skeleton className="h-9 w-52 rounded-md" />
        <Skeleton className="ml-auto h-9 w-56 rounded-md" />
      </div>
      <KpiStripSkeleton count={5} className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3" />
      <TableSkeleton rows={10} cols={7} />
    </div>
  );
}
