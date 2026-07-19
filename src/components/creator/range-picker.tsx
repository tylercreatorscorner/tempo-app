'use client';

/**
 * Creator-portal period selector — the segmented pill used across the portal
 * (Home + Performance) so the range control is identical everywhere, matching
 * the admin side's single, consistent date picker.
 */

export const RANGE_OPTIONS = [7, 14, 30, 90] as const;

/** Coerce a `?range=` query value to a supported window; falls back to 30d. */
export function parseRange(raw: string | undefined, fallback = 30): number {
  const n = Number(raw);
  return (RANGE_OPTIONS as readonly number[]).includes(n) ? n : fallback;
}

export function RangePicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="inline-flex bg-secondary rounded-lg p-1 text-sm">
      {RANGE_OPTIONS.map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={`px-3 py-1 rounded-md transition-all ${
            value === n
              ? 'bg-card text-foreground shadow-[var(--pulse-elev-1)] font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {n}d
        </button>
      ))}
    </div>
  );
}
