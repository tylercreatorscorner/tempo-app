'use client';

import { Suspense, useEffect, type ReactNode } from 'react';
import posthog from 'posthog-js';
import { PostHogProvider as Provider } from 'posthog-js/react';
import { usePathname, useSearchParams } from 'next/navigation';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

if (typeof window !== 'undefined' && POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: 'identified_only',
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: {
      dom_event_allowlist: ['click', 'submit'],
    },
  });
}

function PageviewTrackerInner() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    if (!POSTHOG_KEY || !pathname) return;
    const url = window.origin + pathname + (search?.toString() ? `?${search.toString()}` : '');
    posthog.capture('$pageview', { $current_url: url });
  }, [pathname, search]);

  return null;
}

function PageviewTracker() {
  return (
    <Suspense fallback={null}>
      <PageviewTrackerInner />
    </Suspense>
  );
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  if (!POSTHOG_KEY) return <>{children}</>;
  return (
    <Provider client={posthog}>
      <PageviewTracker />
      {children}
    </Provider>
  );
}
