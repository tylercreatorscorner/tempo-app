'use client';

import { useEffect, useState } from 'react';

/**
 * Time-of-day greeting resolved from the viewer's local clock (so it's correct
 * regardless of server timezone). SSR + first client render both show the
 * neutral fallback to avoid a hydration mismatch, then it updates on mount.
 */
export function Greeting({ name }: { name?: string | null }) {
  const [greeting, setGreeting] = useState('Welcome back');
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
  }, []);
  const first = name?.trim().split(/\s+/)[0];
  return <>{greeting}{first ? `, ${first}` : ''}</>;
}
