import { PageHeaderSkeleton, CardGridSkeleton } from '@/components/ui/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton withControls={false} />
      {/* Tab bar */}
      <Skeleton className="h-9 w-56 rounded-md" />
      {/* Generator card grid */}
      <CardGridSkeleton
        count={3}
        height="h-72"
        className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3"
      />
    </div>
  );
}
