import { PageHeaderSkeleton, TableSkeleton } from '@/components/ui/page-skeletons';

export default function Loading() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <PageHeaderSkeleton />
      <TableSkeleton rows={12} cols={5} />
    </div>
  );
}
