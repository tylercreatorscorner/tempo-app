import { PageHeaderSkeleton, TableSkeleton } from '@/components/ui/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

/** Mirrors the Comms hub's default view: header, tab pills, then the
 *  Broadcasts grid (sent feed left, compose panel right). */
export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton withControls={false} />
      <Skeleton className="h-9 w-72 rounded-md" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)] xl:items-start">
        <TableSkeleton rows={5} cols={4} title />
        <Skeleton className="h-[520px] rounded-xl" />
      </div>
    </div>
  );
}
