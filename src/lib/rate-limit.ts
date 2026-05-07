/**
 * Simple in-memory per-key throttle. Best-effort only — on serverless this
 * resets on cold start and isn't shared across instances. Sufficient to stop
 * a single client from spamming an endpoint a few times per second; not a
 * substitute for an actual rate limiter (Upstash, Redis) when we need
 * production-grade abuse control.
 */
const lastHit = new Map<string, number>();

/**
 * Returns true if the key is allowed to proceed; false if it should be
 * throttled. Garbage-collects stale entries opportunistically.
 */
export function throttle(key: string, minIntervalMs: number): boolean {
  const now = Date.now();
  const prev = lastHit.get(key) ?? 0;
  if (now - prev < minIntervalMs) return false;
  lastHit.set(key, now);

  // Opportunistic GC: clear entries older than 10× the interval.
  if (lastHit.size > 1000) {
    const cutoff = now - minIntervalMs * 10;
    for (const [k, ts] of lastHit) {
      if (ts < cutoff) lastHit.delete(k);
    }
  }
  return true;
}
