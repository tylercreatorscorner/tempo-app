import { PageHeaderSkeleton, CardGridSkeleton } from '@/components/ui/page-skeletons';

export default function Loading() {
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <PageHeaderSkeleton />
      <CardGridSkeleton count={9} height="h-44" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" />
    </div>
  );
}
