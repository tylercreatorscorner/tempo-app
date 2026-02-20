'use client';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h2 className="text-2xl font-bold text-white">Something went wrong</h2>
      <p className="text-muted-foreground text-sm max-w-md text-center">
        {error.message || 'Failed to load dashboard data. This usually means a database connection issue.'}
      </p>
      <button
        onClick={() => reset()}
        className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
