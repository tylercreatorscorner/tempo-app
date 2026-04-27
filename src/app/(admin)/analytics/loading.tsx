// Skeleton shown while the Analytics server page is fetching data.
// Mirrors the real page structure so layout doesn't jump on swap.

function SkeletonCard() {
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

      {/* KPI strip — 6 placeholder cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-[#1A1B3A]/95 via-[#2D1B69]/95 to-[#1A1B3A]/95 p-5 col-span-2 sm:col-span-1">
          <div className="h-3 w-20 rounded bg-white/20 animate-pulse mb-2" />
          <div className="h-7 w-24 rounded bg-white/20 animate-pulse" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>

      {/* Chart row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
          <div className="h-4 w-24 rounded bg-gray-200 animate-pulse mb-3" />
          <div className="h-[260px] rounded bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 animate-pulse" />
        </div>
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
          <div className="h-4 w-32 rounded bg-gray-200 animate-pulse mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <div className="h-3 w-20 rounded bg-gray-100 animate-pulse" />
                  <div className="h-3 w-14 rounded bg-gray-100 animate-pulse" />
                </div>
                <div className="h-2 rounded-full bg-gray-100 animate-pulse" style={{ width: `${100 - i * 15}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Table card */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="h-10 w-80 rounded-xl bg-gray-100 animate-pulse" />
        </div>
        <div className="divide-y divide-gray-50">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-5 py-3.5 grid grid-cols-7 gap-4">
              <div className="h-3 rounded bg-gray-100 animate-pulse col-span-2" />
              <div className="h-3 rounded bg-gray-100 animate-pulse" />
              <div className="h-3 rounded bg-gray-100 animate-pulse" />
              <div className="h-3 rounded bg-gray-100 animate-pulse" />
              <div className="h-3 rounded bg-gray-100 animate-pulse" />
              <div className="h-3 rounded bg-gray-100 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
