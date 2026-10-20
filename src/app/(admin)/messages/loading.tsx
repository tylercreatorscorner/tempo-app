import { PageHeaderSkeleton } from '@/components/ui/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

/** Mirrors the Comms hub's default view: header, tab pills, then the
 *  Broadcasts grid (sent feed left, compose panel right). */
export default function Loading() {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton withControls={false} />
      <Skeleton className="h-14 w-full rounded-xl" />
      <div className="flex flex-wrap gap-2">{Array.from({length:5},(_,i)=><Skeleton key={i} className="h-9 w-28 rounded-lg" />)}</div>
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
        <Skeleton className="h-[520px] rounded-xl" />
        <Skeleton className="h-[520px] rounded-xl" />
      </div>
    </div>
  );
}
