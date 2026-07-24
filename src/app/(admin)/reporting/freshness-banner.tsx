'use client';

/**
 * Freshness banner — warns when the latest processed upload is stale, since
 * every generated report anchors to that date, not today. A failed check
 * degrades to a muted one-liner (never silently vanishes).
 */

import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';

type FreshnessState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ok'; daysOld: number | null; latest: string | null };

export function FreshnessBanner() {
  const [state, setState] = useState<FreshnessState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/reporting/freshness?brand=all')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        if (cancelled) return;
        setState({
          status: 'ok',
          // Only trust a real number — anything else renders as "unknown",
          // never "undefined days old".
          daysOld: typeof d.daysOld === 'number' ? d.daysOld : null,
          latest: d.latestReportDate ?? null,
        });
      })
      .catch(() => { if (!cancelled) setState({ status: 'error' }); });
    return () => { cancelled = true; };
  }, []);

  if (state.status === 'loading') return null;

  // The freshness check is a staleness safety net: a failed check must never
  // silently vanish, so it degrades to a muted one-liner.
  if (state.status === 'error') {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        Couldn&apos;t check data freshness. Reports may anchor to an older upload date.
      </p>
    );
  }

  if (state.daysOld === null || state.daysOld <= 3) return null;

  const dateLabel = state.latest
    ? new Date(state.latest + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'unknown';

  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--pulse-warn)]/25 bg-[var(--pulse-warn-bg)] px-4 py-3">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pulse-warn)]" />
      <div className="text-xs text-foreground">
        <strong>Data is {state.daysOld} days old.</strong> Last upload processed: {dateLabel} (UTC).
        Reports anchor to that date, so period windows show the most recent data available, not today&apos;s.
      </div>
    </div>
  );
}
