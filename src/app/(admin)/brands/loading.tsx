import { PageHeaderSkeleton, KpiStripSkeleton, CardGridSkeleton } from '@/components/ui/page-skeletons';

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <KpiStripSkeleton count={4} />
      <CardGridSkeleton count={6} />
    </div>
  );
}
