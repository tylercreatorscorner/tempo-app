import { Skeleton } from '@/components/ui/skeleton';
import { PageHeaderSkeleton } from '@/components/ui/page-skeletons';

/**
 * /posts route skeleton — mirrors the real layout (header with controls,
 * pill rows, 6-col KPI strip with the 2-span hero, toolbar, card grid) so
 * nothing jumps when the page commits.
 */
export default function PostsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      {/* Brand pills + review pills */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-24 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-9 w-96 max-w-full rounded-full" />
      {/* KPI strip: hero spans 2 of 6 */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Skeleton className="col-span-2 h-[104px] rounded-[20px]" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-[20px]" />
        ))}
      </div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <Skeleton className="h-4 w-32" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-56 rounded-lg" />
          <Skeleton className="h-8 w-16 rounded-lg" />
        </div>
      </div>
      {/* Card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-card border border-border overflow-hidden">
            <Skeleton className="aspect-video w-full rounded-none" />
            <div className="p-4 space-y-3">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
