import { PageHeaderSkeleton, CardGridSkeleton } from '@/components/ui/page-skeletons';

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <CardGridSkeleton count={6} height="h-32" className="grid grid-cols-1 md:grid-cols-3 gap-4" />
    </div>
  );
}
