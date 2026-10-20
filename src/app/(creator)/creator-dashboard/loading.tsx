import portal from '@/components/layout/portal-workspace.module.css';
import { Skeleton } from '@/components/ui/skeleton';

/** Match the compact summary and main/context columns of Creator Home. */
export default function Loading() {
  return (
    <div className={portal.page}>
      <div className={portal.pageHeader}><div className="space-y-2"><Skeleton className="h-3 w-28" /><Skeleton className="h-8 w-64 max-w-full" /><Skeleton className="h-4 w-48" /></div><Skeleton className="h-10 w-36 rounded-lg" /></div>
      <div className={portal.hero}><div className="space-y-3"><Skeleton className="h-3 w-24" /><Skeleton className="h-11 w-52 max-w-full" /><Skeleton className="h-4 w-64 max-w-full" /><Skeleton className="h-3 w-72 max-w-full" /></div><Skeleton className="h-[120px] w-full rounded-lg" /></div>
      <div className={portal.metrics}>{Array.from({ length: 4 }, (_, i) => <div key={i} className="space-y-2"><Skeleton className="h-3 w-20 max-w-full" /><Skeleton className="h-7 w-24 max-w-full" /><Skeleton className="h-3 w-16" /></div>)}</div>
      <div className={portal.homeGrid}>
        <div className={portal.stack}><Skeleton className="h-5 w-36" /><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-[340px] rounded-xl" /></div>
        <div className={portal.stack}><Skeleton className="h-[240px] rounded-xl" /><Skeleton className="h-[220px] rounded-xl" /></div>
      </div>
    </div>
  );
}
