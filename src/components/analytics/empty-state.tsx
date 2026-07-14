import { Inbox } from 'lucide-react';

/** Shown when every fetched series and summary is zero — no creators, no orders, no posts.
 * Most often this means the date range falls outside the brand's ingestion window or the
 * brand truly had no activity. Distinguishes "no data" from "data is zero on a real day". */
export function AnalyticsEmptyState({ rangeLabel }: { rangeLabel: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border shadow-sm p-12 flex flex-col items-center text-center">
      <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#F3F4F8] to-[#E9EAF2] flex items-center justify-center mb-4">
        <Inbox className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-bold text-[var(--foreground)]">No activity in this period</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        We have no GMV, orders, or posts logged between <span className="font-medium text-muted-foreground">{rangeLabel}</span>.
        Try a wider range, switch brands, or wait for the next pipeline run.
      </p>
    </div>
  );
}
