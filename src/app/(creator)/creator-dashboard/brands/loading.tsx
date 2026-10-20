import portal from '@/components/layout/portal-workspace.module.css';
import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/components/ui/page-skeletons';

/** Mirrors the Ledger My Brands: header, hairline strip, brands table. */
export default function Loading() {
  return (
    <div className={portal.page}>
      <div className={portal.pageHeader}>
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-9 w-36 rounded-full" />
      </div>

      <div className={portal.metrics}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2.5 bg-card p-3.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>

      <TableSkeleton rows={6} cols={6} />
    </div>
  );
}
