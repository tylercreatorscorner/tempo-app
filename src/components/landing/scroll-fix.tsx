'use client';

import { useEffect } from 'react';

export function ScrollFix() {
  useEffect(() => {
    // Temporarily disable smooth scrolling to prevent interference
    const html = document.documentElement;
    const originalScrollBehavior = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';

    // Immediately reset scroll
    window.scrollTo(0, 0);
    html.scrollTop = 0;
    document.body.scrollTop = 0;

    // Also reset after a frame (for mobile browsers that defer layout)
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      html.scrollTop = 0;
      document.body.scrollTop = 0;
    });

    // And after a short delay for stubborn mobile browsers
    const timeout = setTimeout(() => {
      window.scrollTo(0, 0);
      html.scrollTop = 0;
      document.body.scrollTop = 0;
      // Restore smooth scrolling
      html.style.scrollBehavior = originalScrollBehavior;
    }, 50);

    return () => clearTimeout(timeout);
  }, []);

  return null;
}
