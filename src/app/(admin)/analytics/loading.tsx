// Skeleton shown while the Analytics server page is fetching data.
// Mirrors the real page structure (header → KPI strip → notable cards →
// performance chart → brand breakdown donut) so layout doesn't jump on swap.

function StatCardSkeleton() {
  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-4 w-4 rounded bg-gray-200 animate-pulse" />
        <div className="h-3 w-24 rounded bg-gray-200 animate-pulse" />
      </div>
      <div className="h-7 w-20 rounded bg-gray-200 animate-pulse" />
    </div>
  );
}

function NotableCardSkeleton() {
  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-7 w-7 rounded-lg bg-gray-100 animate-pulse" />
        <div className="h-3 w-20 rounded bg-gray-100 animate-pulse" />
      </div>
      <div className="h-3.5 w-32 rounded bg-gray-200 animate-pulse mb-1" />
      <div className="h-3 w-24 rounded bg-gray-100 animate-pulse mb-3" />
      <div className="flex items-baseline justify-between">
        <div>
          <div className="h-2.5 w-10 rounded bg-gray-100 animate-pulse mb-1" />
          <div className="h-4 w-16 rounded bg-gray-200 animate-pulse" />
        </div>
        <div className="h-4 w-10 rounded-md bg-gray-100 animate-pulse" />
      </div>
    </div>
  );
}

export default function AnalyticsLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-32 rounded bg-gray-200 animate-pulse" />
          <div className="h-3 w-72 rounded bg-gray-100 animate-pulse" />
        </div>
        <div className="h-10 w-72 rounded-full bg-gray-100 animate-pulse" />
      </div>

      {/* Brand filter pill row */}
      <div className="h-9 w-full rounded-full bg-gray-100 animate-pulse" />

      {/* KPI strip — 7 placeholder cards (hero spans 2 cols + 6 standard) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-[#1A1B3A]/95 via-[#2D1B69]/95 to-[#1A1B3A]/95 p-5 col-span-2 sm:col-span-2 lg:col-span-2">
          <div className="h-3 w-20 rounded bg-white/20 animate-pulse mb-2" />
          <div className="h-7 w-24 rounded bg-white/20 animate-pulse" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>

      {/* Notable Changes — 4 cards */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="h-4 w-4 rounded bg-gray-200 animate-pulse" />
          <div className="h-3 w-32 rounded bg-gray-200 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <NotableCardSkeleton key={i} />
          ))}
        </div>
      </div>

      {/* Performance Overview chart */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="space-y-1.5">
            <div className="h-4 w-40 rounded bg-gray-200 animate-pulse" />
            <div className="h-3 w-56 rounded bg-gray-100 animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-32 rounded-lg bg-gray-100 animate-pulse" />
            <div className="h-8 w-44 rounded-xl bg-gray-100 animate-pulse" />
          </div>
        </div>
        <div className="h-[280px] rounded bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 animate-pulse" />
      </div>

      {/* Brand Breakdown donut */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
        <div className="space-y-1.5 mb-3">
          <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
          <div className="h-3 w-44 rounded bg-gray-100 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="flex justify-center">
            <div className="h-[260px] w-[260px] rounded-full bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 animate-pulse" />
          </div>
          <ul className="space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="h-3 w-24 rounded bg-gray-200 animate-pulse" />
                    <div className="h-2.5 w-32 rounded bg-gray-100 animate-pulse" />
                  </div>
                </div>
                <div className="space-y-1 flex-shrink-0 text-right">
                  <div className="h-3 w-16 rounded bg-gray-200 animate-pulse ml-auto" />
                  <div className="h-2.5 w-10 rounded bg-gray-100 animate-pulse ml-auto" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
