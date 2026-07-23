import { Skeleton } from '@/components/ui/skeleton';

/** /posts/[videoId] skeleton — mirrors header + cover rail + stat card + review form. */
export default function PostReviewLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-7 w-3/4" />
        </div>
        <Skeleton className="h-8 w-36 rounded-lg" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[240px_1fr] items-start">
        <Skeleton className="aspect-[9/16] w-full rounded-2xl" />
        <div className="space-y-5">
          <div className="rounded-xl bg-card border border-border p-5 space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-4 border-t border-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          </div>
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
