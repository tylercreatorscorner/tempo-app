import { PageHeaderSkeleton, KpiStripSkeleton, CardGridSkeleton } from '@/components/ui/page-skeletons';

export default function Loading() {
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <PageHeaderSkeleton />
      <KpiStripSkeleton count={4} />
      <CardGridSkeleton count={2} height="h-52" className="grid grid-cols-1 lg:grid-cols-2 gap-4" />
    </div>
  );
}
