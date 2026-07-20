import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/components/ui/page-skeletons';

/** Mirrors the Ledger Rankings: header, standing band, leaderboard + top-videos split. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      {/* Header + range chip */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-8 w-80 max-w-full" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-36 rounded-full" />
      </div>

      {/* Standing band */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2.5 bg-card p-4 sm:p-5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-20" />
          </div>
        ))}
      </div>

      {/* Leaderboard + top videos */}
      <div className="grid items-start gap-5 lg:grid-cols-[1.55fr_1fr]">
        <TableSkeleton rows={10} cols={4} />
        <Skeleton className="h-[460px] rounded-2xl" />
      </div>
    </div>
  );
}
