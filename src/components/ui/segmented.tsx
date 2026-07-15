'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}

/** Managed / All / Unmanaged-style segmented control. The active pill lifts on
 *  a card surface with the sm elevation (matches the Pulse `.segtabs`). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  className,
  size = 'md',
}: SegmentedControlProps<T>) {
  return (
    <div className={cn('inline-flex gap-0.5 rounded-md bg-secondary border border-border p-1', className)} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(o.value)}
            className={cn(
              'font-semibold rounded-[7px] transition-colors',
              size === 'sm' ? 'text-[11.5px] px-2.5 py-1' : 'text-[12.5px] px-3 py-1.5',
              active
                ? 'bg-card text-foreground shadow-[var(--pulse-elev-1)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
