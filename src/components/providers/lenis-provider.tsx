'use client';

import { useEffect, type ReactNode } from 'react';
import Lenis from 'lenis';

export function LenisProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Respect users who've requested reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.5,
      // Don't hijack the wheel when the cursor is over a natively-scrollable
      // element (dropdown menus, modals, any overflow-auto/scroll area) — let it
      // scroll itself instead of the page. Without this, Lenis intercepts wheel
      // at the document level and every inner scroll area scrolls the page
      // instead. Also honors the explicit `data-lenis-prevent` opt-out.
      prevent: (node) => {
        let el: HTMLElement | null = node;
        for (let i = 0; el && i < 8; i++, el = el.parentElement) {
          if (el.hasAttribute('data-lenis-prevent')) return true;
          const oy = window.getComputedStyle(el).overflowY;
          if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return true;
        }
        return false;
      },
    });

    let frame: number;
    function raf(time: number) {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    }
    frame = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
