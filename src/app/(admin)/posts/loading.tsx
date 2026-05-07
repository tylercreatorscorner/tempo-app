import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-32 bg-gray-100 rounded animate-pulse" />
          <div className="h-4 w-72 bg-gray-100 rounded animate-pulse" />
        </div>
        <div className="h-9 w-48 bg-gray-100 rounded-xl animate-pulse" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-7 w-20 bg-gray-100 rounded-full animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
        ))}
      </div>
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-12 text-center text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading posts…
      </div>
    </div>
  );
}
