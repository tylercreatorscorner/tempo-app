'use client';

import * as React from 'react';
import { Tooltip } from 'radix-ui';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import styles from './info-tooltip.module.css';

/**
 * Hover/focus tooltip for explaining a metric or column. The default info
 * button also toggles on tap or keyboard activation. Pass `label` (the
 * explanation) and optionally wrap a trigger via `children`; with no children it
 * renders a small info glyph. Built on the Radix Tooltip primitive so it's
 * accessible (keyboard-focusable, ARIA) and collision-aware. Theme-aware:
 * inverted foreground/background chip, matching the chart hover tooltip.
 */
export function InfoTooltip({
  label,
  children,
  side = 'top',
  className,
  iconClassName,
}: {
  label: React.ReactNode;
  children?: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
  iconClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const pinned = React.useRef(false);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const defaultTrigger = children == null;
  const close = React.useCallback(() => { pinned.current = false; setOpen(false); }, []);
  React.useEffect(() => {
    if (!defaultTrigger || !open) return;
    const onScroll = () => close();
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [defaultTrigger, open, close]);
  return (
    <Tooltip.Provider delayDuration={120} skipDelayDuration={300}>
      <Tooltip.Root open={defaultTrigger ? open : undefined} onOpenChange={defaultTrigger ? next => {
        // A tapped explanation stays readable after the touch pointer leaves.
        // Explicit dismissal below still handles Escape, blur and outside taps.
        if (next || !pinned.current) setOpen(next);
      } : undefined}>
        <Tooltip.Trigger asChild>
          {children ?? (
            <button
              ref={trigger}
              type="button"
              aria-label="More information"
              aria-expanded={open}
              onClick={event => {
                // Radix's hover tooltip normally closes on click. Pin the
                // default info button instead, so touch and keyboard work too.
                event.preventDefault();
                pinned.current = !pinned.current;
                setOpen(pinned.current);
              }}
              onBlur={close}
              onPointerLeave={event => { if (event.pointerType !== 'touch' && pinned.current) close(); }}
              className={cn(
                'inline-flex items-center text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:text-foreground',
                styles.trigger,
                className,
              )}
            >
              <Info className={cn('h-3 w-3', iconClassName)} />
            </button>
          )}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            onEscapeKeyDown={defaultTrigger ? close : undefined}
            onPointerDownOutside={defaultTrigger ? event => {
              if (trigger.current?.contains(event.detail.originalEvent.target as Node)) {
                event.preventDefault();
              } else close();
            } : undefined}
            side={side}
            sideOffset={6}
            collisionPadding={12}
            className="z-50 max-w-[240px] rounded-lg bg-foreground px-3 py-2 text-xs font-medium leading-snug text-background shadow-[var(--pulse-elev-2)]"
          >
            {label}
            <Tooltip.Arrow className="fill-[var(--foreground)]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
