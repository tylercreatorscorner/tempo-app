import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route skeleton for the Ledger Home. Mirrors the REAL layout — greeting +
 * range chip, serif hero number beside the sparkline card, the 4-cell ledger
 * strip, flex band, then section cards — so nothing jumps on commit. (The old
 * skeleton mirrored the pre-Ledger page and looked alien while loading.)
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      {/* Hero: greeting + big number + delta (left), range chip + sparkline card (right) */}
      <div className="grid gap-x-6 gap-y-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-[72px] w-[340px] max-w-full" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-20 rounded-lg" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-3.5 w-72" />
        </div>
        <div className="flex flex-col items-end gap-3">
          <Skeleton className="h-9 w-36 rounded-full" />
          <Skeleton className="h-[158px] w-full rounded-2xl" />
        </div>
      </div>

      {/* Ledger KPI strip */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2.5 bg-card p-4 sm:p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Network flex band */}
      <Skeleton className="h-[54px] rounded-2xl" />

      {/* Next moves */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-36" />
          <div className="h-px flex-1 bg-border" />
        </div>
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-[84px] rounded-xl" />
        ))}
      </div>

      {/* Two-up cards */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Skeleton className="h-[300px] rounded-2xl" />
        <Skeleton className="h-[300px] rounded-2xl" />
      </div>
    </div>
  );
}
