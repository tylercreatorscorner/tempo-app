import { Skeleton } from '@/components/ui/skeleton';
import { PageHeaderSkeleton, TableSkeleton } from '@/components/ui/page-skeletons';

/**
 * /posts route skeleton — mirrors the real layout (header with controls,
 * 6-col KPI strip with the 2-span hero, toolbar, dense table) so nothing
 * jumps when the page commits.
 */
export default function PostsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      {/* KPI strip: hero spans 2 of 6 */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Skeleton className="col-span-2 h-[104px] rounded-[20px]" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-[20px]" />
        ))}
      </div>
      {/* Toolbar: queue chips + search + CSV */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <Skeleton className="h-9 w-80 rounded-full" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-56 rounded-lg" />
          <Skeleton className="h-8 w-16 rounded-lg" />
        </div>
      </div>
      <TableSkeleton rows={10} cols={8} title={false} />
    </div>
  );
}
