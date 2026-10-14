import { Skeleton } from '@/components/ui/skeleton';
import { PageHeaderSkeleton, TableSkeleton } from '@/components/ui/page-skeletons';
/** Mirrors the current content overview, filters and video table on mobile too. */
export default function PostsLoading() {
  return <div className="space-y-4" aria-busy="true">
    <PageHeaderSkeleton />
    <div className="overflow-hidden rounded-xl border border-border bg-card p-4" aria-hidden="true">
      <div className="mb-4 flex flex-wrap justify-between gap-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-8 w-40" /></div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-8">{Array.from({length:8},(_,i)=><div key={i} className="space-y-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-6 w-24" /></div>)}</div>
    </div>
    <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">{[0,1,2,3].map(i=><Skeleton key={i} className="h-9 w-full" />)}</div>
    <TableSkeleton rows={8} cols={8} title={false} />
  </div>;
}
