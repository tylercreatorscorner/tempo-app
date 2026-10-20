import { PageHeaderSkeleton, KpiStripSkeleton, ChartSkeleton, TableSkeleton } from '@/components/ui/page-skeletons';

/** Mirrors the commitment ledger with a supporting brand/activity column. */
export default function Loading() {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton />
      <KpiStripSkeleton count={4} className="grid grid-cols-2 lg:grid-cols-4 gap-3" />
      <div className="grid min-w-0 items-start gap-4 min-[1440px]:grid-cols-[minmax(0,1fr)_310px]">
        <TableSkeleton rows={8} cols={5} />
        <div className="min-w-0 space-y-4"><ChartSkeleton /><TableSkeleton rows={4} cols={1} /></div>
      </div>
    </div>
  );
}
