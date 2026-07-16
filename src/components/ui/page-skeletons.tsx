import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

/**
 * Composable route-skeleton pieces, so each `loading.tsx` is a few lines that
 * mirror its page's real shape instead of another hand-rolled block. Every
 * admin route is request-time dynamic, so these are what the user actually
 * looks at while the server renders — they should match the destination closely
 * enough that nothing jumps on commit.
 */

/** Title + subtitle, with an optional right-hand control cluster (period chip). */
export function PageHeaderSkeleton({ withControls = true, subtitle = true }: { withControls?: boolean; subtitle?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        {subtitle && <Skeleton className="h-4 w-72" />}
      </div>
      {withControls && (
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-32 rounded-full" />
        </div>
      )}
    </div>
  );
}

/** KPI card strip. */
export function KpiStripSkeleton({ count = 4, className = 'grid grid-cols-2 lg:grid-cols-4 gap-4' }: { count?: number; className?: string }) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-[104px] rounded-[20px]" />
      ))}
    </div>
  );
}

/** A card-wrapped table: header row + n body rows of c columns. */
export function TableSkeleton({ rows = 8, cols = 5, title = true }: { rows?: number; cols?: number; title?: boolean }) {
  return (
    <Card className="overflow-hidden">
      {title && (
        <CardHeader>
          <Skeleton className="h-3 w-36" />
        </CardHeader>
      )}
      <CardContent className="space-y-3 pb-5">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center justify-between gap-4">
            <Skeleton className="h-4 w-40 shrink-0" />
            <div className="flex flex-1 items-center justify-end gap-4">
              {Array.from({ length: Math.max(0, cols - 1) }).map((_, c) => (
                <Skeleton key={c} className="h-3.5 w-16" />
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** A block of equal cards (brand grid, product grid). */
export function CardGridSkeleton({ count = 6, height = 'h-40', className = 'grid grid-cols-1 md:grid-cols-2 gap-4' }: { count?: number; height?: string; className?: string }) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={`${height} rounded-[20px]`} />
      ))}
    </div>
  );
}

/** Chart card placeholder. */
export function ChartSkeleton({ className = '' }: { className?: string }) {
  return <Skeleton className={`h-[232px] rounded-[20px] ${className}`} />;
}
