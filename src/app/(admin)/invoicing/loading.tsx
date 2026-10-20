import { PageHeaderSkeleton } from '@/components/ui/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

/** Mirrors the default Board view: header, then four lifecycle columns. */
export default function Loading() {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton />
      <Skeleton className="h-20 rounded-[var(--workspace-surface-radius,14px)]" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[320px] rounded-xl" />
          ))}
        </div>
    </div>
  );
}
