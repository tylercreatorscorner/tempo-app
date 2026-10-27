'use client';

import { useEffect, useRef, useState } from 'react';
import { useTikTokThumbnail } from '@/hooks/use-tiktok-thumbnail';

/** Defer both the oEmbed request and cover image until the row is near view. */
export function useVisibleThumbnail<T extends HTMLElement>(url: string | null, identity: { creatorName: string; videoId: string }) {
  const coverRef = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = coverRef.current;
    if (!node) return;
    let active = true;
    if (typeof IntersectionObserver === 'undefined') {
      // Older browsers still get covers. Do not enqueue a state update after
      // this row has unmounted while the fallback microtask is waiting.
      void Promise.resolve().then(() => { if (active) setVisible(true); });
      return () => { active = false; };
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!active || !entry?.isIntersecting) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: '160px' });
    observer.observe(node);
    return () => { active = false; observer.disconnect(); };
  }, []);
  const image = useTikTokThumbnail(visible ? url : null, visible ? identity : undefined);
  return { coverRef, ...image };
}
