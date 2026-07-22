import { AlertTriangle } from 'lucide-react';

interface Props {
  /** ISO date string of the most recent data point (e.g. "2026-04-29"). */
  latestDate: string;
  /** Days between latestDate and now. */
  daysStale: number;
}

export interface StaleBrand {
  label: string;
  /** Latest brand_daily_stats date, null = no data ever. */
  lastDate: string | null;
  staleDays: number;
}

/**
 * PER-BRAND stale-data alarm. The aggregate banner below can't catch a single
 * dead brand — the freshest brand masks it (during the Jen incident six brands
 * silently stopped receiving uploads for 13 days while LeeFar stayed current,
 * so nothing fired). This one names each ACTIVE brand whose rollup is behind.
 *
 * Deliberately NOT dismissible: it clears by uploading the missing days, or by
 * archiving a genuinely dead brand in brands_v2 (archived brands are excluded
 * upstream).
 */
export function StaleBrandsBanner({ stale }: { stale: StaleBrand[] }) {
  if (stale.length === 0) return null;
  const worst = Math.max(...stale.map((s) => s.staleDays));

  return (
    <div className="rounded-xl border border-[var(--pulse-warn)]/35 bg-[var(--pulse-warn-bg)] px-4 py-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pulse-warn)]" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">
            {stale.length === 1 ? '1 brand has' : `${stale.length} brands have`} stale data
            {worst >= 7 ? ` — the worst is ${worst} days behind` : ''}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {stale.map((s, i) => (
              <span key={s.label} className="whitespace-nowrap">
                {i > 0 && ' · '}
                <span className="font-semibold text-foreground">{s.label}</span>{' '}
                {s.lastDate ? `(${s.staleDays}d, last ${fmtShortDate(s.lastDate)})` : '(no data ever)'}
              </span>
            ))}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground/80">
            Upload the missing daily files to clear this, or archive the brand in brands_v2 if it&apos;s
            intentionally inactive.
          </p>
        </div>
      </div>
    </div>
  );
}

function fmtShortDate(s: string): string {
  const d = new Date(s + 'T00:00:00Z');
  return isNaN(d.getTime())
    ? s
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Surfaces when performance data hasn't been refreshed in >3 days, so users
 * don't mistake yesterday's empty brief for "we did $0" when the real cause
 * is a stalled sync.
 */
export function StaleDataBanner({ latestDate, daysStale }: Props) {
  return (
    <div className="rounded-xl bg-[var(--pulse-warn-bg)] border border-[var(--pulse-warn)]/25 p-4 flex items-start gap-3">
      <div className="h-9 w-9 rounded-xl bg-[var(--pulse-warn)]/15 flex items-center justify-center flex-shrink-0">
        <AlertTriangle className="h-4 w-4 text-[var(--pulse-warn)]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">
          Performance data is{' '}
          <span className="font-bold tabular-nums">
            {daysStale} {daysStale === 1 ? 'day' : 'days'}
          </span>{' '}
          old
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Last data point: <span className="tabular-nums">{new Date(latestDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>.
          Numbers below may be lower than reality until a fresh upload is processed.
        </p>
      </div>
    </div>
  );
}
