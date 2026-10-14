import { PageHeaderSkeleton, TableSkeleton } from '@/components/ui/page-skeletons';

export default function Loading() {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton />
      <TableSkeleton rows={12} cols={5} />
    </div>
  );
}
