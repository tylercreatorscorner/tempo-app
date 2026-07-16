import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

/**
 * Shown the instant /dashboard is clicked. Without this the router had nothing
 * cached and no fallback to render, so it kept the PREVIOUS page fully painted
 * for the whole server render — the app looked frozen rather than busy.
 *
 * Mirrors the real layout (greeting → 5 KPIs → chart + donut → brand table +
 * roster health) so the page doesn't jump when it commits.
 */
export default function Loading() {
  return (
    <div className="space-y-4">
      {/* Greeting + period chip */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-32 rounded-full" />
          <Skeleton className="h-7 w-40 rounded-full" />
        </div>
      </div>

      {/* KPI strip — 5 across, hero first */}
      <div className="grid grid-cols-2 gap-[14px] lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-[20px]" />
        ))}
      </div>

      {/* Managed GMV trend + Managed vs Organic */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-[232px] rounded-[20px] lg:col-span-2" />
        <Skeleton className="h-[232px] rounded-[20px]" />
      </div>

      {/* Brand Performance + Roster Health */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-3 w-36" />
          </CardHeader>
          <CardContent className="space-y-3 pb-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="h-2.5 w-2.5 rounded-[3px]" />
                  <Skeleton className="h-3.5 w-28" />
                </div>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-3.5 w-16" />
                  <Skeleton className="h-3.5 w-16" />
                  <Skeleton className="h-3.5 w-10" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-3 w-28" />
          </CardHeader>
          <CardContent className="space-y-5">
            <Skeleton className="h-7 w-40" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-8" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
