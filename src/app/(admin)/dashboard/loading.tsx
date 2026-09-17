import { Skeleton } from '@/components/ui/skeleton';
import { ChartLoading, LoadingStatus } from '@/components/ui/loading-status';

/** Match the released dashboard so loading doesn't resurrect the old layout. */
export default function Loading() {
  return <div className="space-y-6" aria-busy="true">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-primary">Agency overview</p>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1></div>
      <LoadingStatus label="Loading dashboard" detail="Preparing your workspace overview" />
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-hidden="true">
      {Array.from({ length:5 }, (_,i) => <div key={i} className="space-y-4 rounded-2xl border border-border bg-card p-4 last:col-span-2 lg:last:col-span-1">
        <Skeleton className="h-3 w-24 max-w-full" /><Skeleton className="h-7 w-28 max-w-full" /><Skeleton className="h-3 w-20" />
      </div>)}
    </div>
    <div className="grid gap-4 sm:grid-cols-2" aria-hidden="true">
      {[0,1].map(i => <div key={i} className="space-y-3 rounded-2xl border border-border bg-card p-5"><Skeleton className="h-3 w-36" /><Skeleton className="h-6 w-24" /></div>)}
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-2xl border border-border bg-card p-4 lg:col-span-2"><ChartLoading label="Loading performance" /></div>
      <div className="space-y-5 rounded-2xl border border-border bg-card p-5" aria-hidden="true"><Skeleton className="h-4 w-28" /><Skeleton className="h-10 w-20" /><Skeleton className="h-2 w-full" /><Skeleton className="h-4 w-36" /></div>
    </div>
  </div>;
}
