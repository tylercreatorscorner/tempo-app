'use client';

import { AlertTriangle, RotateCw } from 'lucide-react';

/**
 * Shared route error boundary body. Every route that gains a `loading.tsx`
 * ships an `error.tsx` beside it in the same commit: a loading boundary turns a
 * failing render into a skeleton, and without an error boundary that skeleton
 * has no way to resolve — an indefinite "loading" over something that already
 * died is the worst version of the silent-zero problem.
 *
 * Note this only catches renders that THROW. The reads that resolve to a fake
 * `$0`/empty on failure (`.catch(() => [])`) never reach here — those are fixed
 * at the call site by returning null and rendering "—".
 *
 * Shows the digest (so a failure can be traced in the Vercel logs) but not the
 * stack — this is a live client-facing app, not a debug console.
 */
export function PageError({
  error,
  reset,
  what = 'this page',
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /** e.g. "the dashboard" — used in the message. */
  what?: string;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--pulse-neg)]/10">
        <AlertTriangle className="h-5 w-5" style={{ color: 'var(--pulse-neg)' }} />
      </span>
      <h2 className="text-lg font-bold text-foreground">Couldn&apos;t load {what}</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        This is an error on our side, not a sign that your data is empty. Try again — if it keeps
        happening, the reference below identifies the failure in the logs.
      </p>
      <button
        onClick={reset}
        className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
      >
        <RotateCw className="h-3.5 w-3.5" />
        Try again
      </button>
      {error.digest && (
        <p className="mt-1 font-mono text-[11px] text-muted-foreground/60">Ref: {error.digest}</p>
      )}
    </div>
  );
}
