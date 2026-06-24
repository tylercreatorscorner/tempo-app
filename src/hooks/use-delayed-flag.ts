import { useEffect, useState } from 'react';

/**
 * Returns true only after `value` has stayed true for `delayMs`, and flips back
 * to false the instant `value` is false. Use it to gate a loading indicator so
 * it doesn't flash on fast operations (e.g. a refetch that returns in ~0.3s).
 *
 *   const showBar = useDelayedFlag(loading);   // 150ms default
 */
export function useDelayedFlag(value: boolean, delayMs = 150): boolean {
  const [flag, setFlag] = useState(false);
  useEffect(() => {
    if (!value) { setFlag(false); return; }
    const t = setTimeout(() => setFlag(true), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return flag;
}
