import { PageHeaderSkeleton, KpiStripSkeleton, TableSkeleton } from '@/components/ui/page-skeletons';
import layout from '@/components/ui/workspace-layout.module.css';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className={layout.page}>
      <PageHeaderSkeleton />
      <KpiStripSkeleton count={3} className="grid gap-3 md:grid-cols-3" />
      <TableSkeleton rows={9} cols={6} />
      <div className={layout.balanced}><Skeleton className="h-64 rounded-xl" /><TableSkeleton rows={4} cols={3} /></div>
    </div>
  );
}
