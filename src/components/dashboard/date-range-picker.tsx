'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar, ChevronDown, Check } from 'lucide-react';
import { DATE_PRESETS, type DatePreset } from '@/lib/data/date-utils';
import { CustomRangePopover } from './custom-range-popover';
import { useNavigationPending } from '@/components/layout/navigation-pending';
import { cn } from '@/lib/utils';

/**
 * Compact period control — a single rounded "chip" showing the active range
 * with a caret, opening a dropdown of presets + a custom range. Matches the
 * Pulse mockup's `.chip` selector (one small pill, not a wide button bar), and
 * is the shared date control across the admin cockpit.
 */
export function DateRangePicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // The shell's shared transition, not a local one: this push invalidates every
  // number on the page, so the pending affordance belongs over the CONTENT. A
  // local isPending could only ever dim this chip, which is what made changing
  // period look like nothing happened while stale figures sat there.
  const { isPending, startNav } = useNavigationPending();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const current     = (searchParams.get('range') as DatePreset) || 'last7';
  const customStart = searchParams.get('start');
  const customEnd   = searchParams.get('end');
  const isCustom    = current === 'custom' && !!customStart && !!customEnd;

  // Close the menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  function selectPreset(preset: DatePreset) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', preset);
    params.delete('start');
    params.delete('end');
    setMenuOpen(false);
    startNav(() => router.push(`?${params.toString()}`));
  }

  function applyCustom(start: string, end: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', 'custom');
    params.set('start', start);
    params.set('end', end);
    setPickerOpen(false);
    setMenuOpen(false);
    startNav(() => router.push(`?${params.toString()}`));
  }

  const fmtCustom = (s: string) => {
    const [y, m, d] = s.split('-');
    return `${parseInt(m)}/${parseInt(d)}/${y.slice(2)}`;
  };
  const currentLabel = isCustom
    ? `${fmtCustom(customStart!)} – ${fmtCustom(customEnd!)}`
    : DATE_PRESETS.find((p) => p.value === current)?.label ?? 'Last 7 Days';

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        disabled={isPending}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold shadow-sm transition-colors',
          'hover:border-[var(--primary)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40',
          // No opacity here: the shell's NavigationPendingOverlay already dims
          // the whole content region (this chip included), and stacking the two
          // washed it out to ~0.42. Just block re-entry.
          isPending && 'pointer-events-none',
        )}
      >
        <span className="tabular-nums text-foreground">{currentLabel}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', menuOpen && 'rotate-180')} />
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-44 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-[var(--pulse-elev-2)]"
        >
          {DATE_PRESETS.map((p) => {
            const active = !isCustom && current === p.value;
            return (
              <button
                key={p.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => selectPreset(p.value)}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-primary/10 text-[var(--primary)]' : 'text-foreground hover:bg-muted',
                )}
              >
                {p.label}
                {active && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setPickerOpen(true);
              setMenuOpen(false);
            }}
            className={cn(
              'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isCustom ? 'bg-primary/10 text-[var(--primary)]' : 'text-foreground hover:bg-muted',
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Custom range…
            </span>
            {isCustom && <Check className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}

      {pickerOpen && (
        <CustomRangePopover
          initialStart={customStart}
          initialEnd={customEnd}
          onApply={applyCustom}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
