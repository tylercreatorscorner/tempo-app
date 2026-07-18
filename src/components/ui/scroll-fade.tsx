'use client';

import { useRef, useState, useEffect, useCallback, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Horizontal scroll container with edge-fade affordances. When the content is
 * wider than the viewport, a gradient fade appears on whichever edge(s) have
 * more content, and disappears once you reach that end — the standard "there's
 * more →" cue used by data-dense tables.
 *
 * Why this exists: the roster table is 8 columns / ~1,550px wide, so on a 1,440
 * laptop ROI and Joined sit off the right edge with no hint they're reachable.
 * ROI is the page's whole point ("are they worth the cost"), so the scroll has
 * to announce itself. Reusable for any wide table (/posts, /earnings).
 *
 * The fades are pointer-events-none so they never intercept clicks, and they
 * blend from --card, so wrap this in a bg-card surface. A ResizeObserver keeps
 * the edges correct as rows load or columns change, not just on manual scroll.
 */
export function ScrollFade({
  children,
  className,
  fadeClassName,
}: {
  children: ReactNode;
  /** Extra classes for the inner scroll element (e.g. the refetch-dim opacity). */
  className?: string;
  /** Override the fade tint (defaults to --card). */
  fadeClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    // 1px slack so sub-pixel rounding doesn't leave a fade stuck on at the end.
    setEdges({
      left: scrollLeft > 1,
      right: scrollLeft + clientWidth < scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    // Content can grow/shrink without a scroll or resize event (rows stream in,
    // columns toggle) — observe the element so the edges stay honest.
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      ro.disconnect();
    };
  }, [update]);

  const fade = fadeClassName ?? 'from-[var(--card)]';

  return (
    <div className="relative">
      <div ref={ref} className={cn('overflow-x-auto', className)}>
        {children}
      </div>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r to-transparent transition-opacity duration-200',
          fade,
          edges.left ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l to-transparent transition-opacity duration-200',
          fade,
          edges.right ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}
