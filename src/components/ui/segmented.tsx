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
  /** Accessible label for the group (announced by screen readers). */
  ariaLabel?: string;
}

/** Managed / All / Unmanaged-style segmented control. The active pill lifts on
 *  a card surface with the sm elevation (matches the Pulse `.segtabs`). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  className,
  size = 'md',
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      className={cn('inline-flex max-w-full gap-0.5 overflow-x-auto rounded-[var(--workspace-control-radius,8px)] bg-muted border border-border p-1', className)}
      role="tablist"
      aria-label={ariaLabel}
    >
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
              'shrink-0 max-md:min-h-11 [@media(pointer:coarse)]:min-h-11 font-medium rounded-[5px] transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              size === 'sm' ? 'text-xs px-2.5 py-1' : 'text-[13px] px-3 py-1.5',
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
