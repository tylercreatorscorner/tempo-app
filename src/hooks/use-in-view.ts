'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * One-shot IntersectionObserver: `inView` flips true the first time the node
 * nears the viewport and stays true. Built for lazy side-effects that should
 * fire once per mount (e.g. the TikTok oEmbed thumbnail fetch on /posts —
 * 300 mounted cards must not fire 300 fetches up front; only the ones the
 * user actually scrolls near).
 */
export function useInView<T extends HTMLElement>(rootMargin = '200px'): {
  ref: React.RefObject<T | null>;
  inView: boolean;
} {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;              // one-shot: nothing to observe once seen
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);               // ancient browser: just load
      return;
    }
    const io = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) setInView(true); },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootMargin]);

  return { ref, inView };
}
