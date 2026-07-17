import { formatCurrency } from '@/lib/utils/format';

/**
 * Managed vs Organic split of affiliate GMV. "Organic" = brand-wide affiliate
 * GMV not attributable to a managed creator (total − managed).
 *
 * WHY THIS ISN'T A DONUT ANY MORE. It used to be a 2-slice donut, which had two
 * problems. First, it restated the "Managed Share" KPI sitting directly above it
 * — the same 22%, encoded as an angle, which reads worse than the number already
 * printed. Second, a 104px circle in a quarter-width card left the bottom third
 * of the card empty, which is what prompted the rethink.
 *
 * A stacked bar spends the card's WIDTH (what we actually have) instead of its
 * height, shows the same part-to-whole honestly, and leaves room for the thing
 * neither the donut nor the KPI could tell you: whether our share is GROWING.
 * That's the point of the card now — the level is a KPI, the DIRECTION is here.
 *
 * Share delta is in POINTS, not percent: 22% from 19% is +3 points, not +16%.
 * Percent-of-a-percent is a classic way to make a small move look enormous.
 */
export function ManagedOrganicDonut({
  managed,
  organic,
  prevManaged,
  prevTotal,
}: {
  managed: number;
  organic: number;
  /** Managed GMV in the previous period of equal length. */
  prevManaged?: number;
  /** TOTAL GMV in the previous period of equal length. */
  prevTotal?: number;
}) {
  const total = managed + organic;
  const managedPct = total > 0 ? (managed / total) * 100 : 0;
  const organicPct = total > 0 ? 100 - managedPct : 0;

  // Only claim a trend when BOTH prior figures are real — a missing prior total
  // would silently render the current share as if it were the change.
  const prevPct =
    prevManaged != null && prevTotal != null && prevTotal > 0 ? (prevManaged / prevTotal) * 100 : null;
  const deltaPts = prevPct != null && total > 0 ? managedPct - prevPct : null;
  const up = (deltaPts ?? 0) >= 0;

  return (
    <div className="space-y-4">
      {/* Headline: the share, and whether it's moving */}
      <div className="flex items-baseline gap-2">
        <span className="text-[28px] font-extrabold leading-none tracking-tight tabular-nums text-foreground">
          {total > 0 ? `${managedPct.toFixed(0)}%` : '—'}
        </span>
        {deltaPts != null && (
          <span
            className="text-[12px] font-bold tabular-nums"
            style={{ color: up ? 'var(--pulse-pos)' : 'var(--pulse-neg)' }}
          >
            {up ? '▲' : '▼'}{Math.abs(deltaPts) < 1 ? Math.abs(deltaPts).toFixed(1) : Math.abs(deltaPts).toFixed(0)} pts
          </span>
        )}
      </div>
      <p className="-mt-3 text-[11px] font-medium text-muted-foreground">
        of affiliate GMV is yours{deltaPts != null ? ' · vs prev period' : ''}
      </p>

      {/* The split. One bar, two segments, 2px gap so the boundary is a real
          edge rather than two colours touching. */}
      {total > 0 && (
        <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full">
          <div className="h-full rounded-l-full bg-[var(--primary)]" style={{ width: `${managedPct}%` }} />
          <div className="h-full rounded-r-full bg-secondary" style={{ width: `${organicPct}%` }} />
        </div>
      )}

      {/* Values — the actual new information the KPI above doesn't carry */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-[3px] bg-[var(--primary)]" />
            <span className="truncate text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Managed</span>
          </span>
          <span className="text-[13px] font-bold tabular-nums text-foreground">{formatCurrency(managed)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-[3px] bg-secondary" />
            <span className="truncate text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Organic</span>
          </span>
          <span className="text-[13px] font-bold tabular-nums text-muted-foreground">{formatCurrency(organic)}</span>
        </div>
      </div>
    </div>
  );
}
