'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { RANGE_OPTIONS } from '@/lib/creator/range';
import { cn } from '@/lib/utils';

/**
 * Creator-portal period selector — a dropdown chip matching the admin's
 * DateRangePicker (rounded pill + caret, menu of presets with a check on the
 * active one). Keeps the numeric value/onChange API the portal pages already use.
 */
export function RangePicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = (n: number) => `Last ${n} days`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold shadow-sm transition-colors',
          'hover:border-[var(--primary)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40',
        )}
      >
        <span className="tabular-nums text-foreground">{label(value)}</span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-44 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-[var(--pulse-elev-2)]"
        >
          {RANGE_OPTIONS.map((n) => {
            const active = n === value;
            return (
              <button
                key={n}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setOpen(false);
                  onChange(n);
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-primary/10 text-[var(--primary)]' : 'text-foreground hover:bg-muted',
                )}
              >
                {label(n)}
                {active && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
