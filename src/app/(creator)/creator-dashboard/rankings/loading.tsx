import { Skeleton } from '@/components/ui/skeleton';
import { PageHeaderSkeleton, TableSkeleton } from '@/components/ui/page-skeletons';

export default function Loading() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <PageHeaderSkeleton />
      {/* "Your position" hero (gauge card + hero StatCard). */}
      <Skeleton className="h-[168px] rounded-[20px]" />
      <TableSkeleton rows={10} cols={5} />
    </div>
  );
}
