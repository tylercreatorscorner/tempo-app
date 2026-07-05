import { AlertTriangle } from 'lucide-react';

interface Props {
  /** ISO date string of the most recent data point (e.g. "2026-04-29"). */
  latestDate: string;
  /** Days between latestDate and now. */
  daysStale: number;
}

/**
 * Surfaces when performance data hasn't been refreshed in >3 days, so users
 * don't mistake yesterday's empty brief for "we did $0" when the real cause
 * is a stalled sync.
 */
export function StaleDataBanner({ latestDate, daysStale }: Props) {
  return (
    <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
      <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-900">
          Performance data is <span className="font-bold tabular-nums">{daysStale}</span> {daysStale === 1 ? 'day' : 'days'} old
        </p>
        <p className="text-xs text-amber-700 mt-0.5">
          Last data point: <span className="tabular-nums">{new Date(latestDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>.
          Numbers below may be lower than reality until a fresh upload is processed.
        </p>
      </div>
    </div>
  );
}
