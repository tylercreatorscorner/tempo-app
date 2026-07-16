'use client';

import * as React from 'react';
import { Tooltip } from 'radix-ui';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Hover/focus tooltip for explaining a metric or column. Pass `label` (the
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
  return (
    <Tooltip.Provider delayDuration={120} skipDelayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          {children ?? (
            <button
              type="button"
              aria-label="More information"
              className={cn(
                'inline-flex items-center text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:text-foreground',
                className,
              )}
            >
              <Info className={cn('h-3 w-3', iconClassName)} />
            </button>
          )}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
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
