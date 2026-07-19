'use client';

import { RANGE_OPTIONS } from '@/lib/creator/range';

/**
 * Creator-portal period selector — the segmented pill used across the portal
 * (Home + Performance) so the range control is identical everywhere, matching
 * the admin side's single, consistent date picker.
 */
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
