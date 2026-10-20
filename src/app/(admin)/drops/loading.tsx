import { PageHeaderSkeleton } from '@/components/ui/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton />
      <div className="grid items-start gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
        <Skeleton className="h-[300px] rounded-xl"/>
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({length:6},(_,i)=><Skeleton key={i} className="h-28 rounded-xl"/>)}
        </div>
      </div>
    </div>
  );
}
