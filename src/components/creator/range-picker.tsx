'use client';

import { SegmentedControl } from '@/components/ui/segmented';
import { RANGE_OPTIONS } from '@/lib/creator/range';

/**
 * Creator-portal period selector — thin wrapper over the shared SegmentedControl
 * so Home / Performance / Rankings / Discover all use the ONE canonical segmented
 * control (with tablist/aria-selected + focus ring), instead of three hand-rolled
 * copies. Keeps the numeric value/onChange API the pages already pass.
 */
export function RangePicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <SegmentedControl
      size="sm"
      ariaLabel="Date range"
      value={String(value)}
      onValueChange={(v) => onChange(Number(v))}
      options={RANGE_OPTIONS.map((n) => ({ value: String(n), label: `${n}d` }))}
    />
  );
}
