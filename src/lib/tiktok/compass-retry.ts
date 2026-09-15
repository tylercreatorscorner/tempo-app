import { TikTokError, TikTokRateLimitError, TikTokTransientError } from './client';

export interface CompassRetryInfo {
  reason: 'rate_limit' | 'transient' | 'pending';
  notBefore: string;
  upstreamStatus: number | null;
  upstreamCode: number | null;
  requestId: string | null;
}

/** Only structured SDK errors determine retry timing. Never parse arbitrary
 * message text, copy a response body, or infer a replacement GMV value. */
export function compassRetryInfo(error: unknown, now = Date.now()): CompassRetryInfo | undefined {
  if (!(error instanceof TikTokError)) return undefined;
  const rateLimited = error instanceof TikTokRateLimitError || error.status === 429 || error.code === 36009037;
  if (!rateLimited && !(error instanceof TikTokTransientError)) return undefined;
  const headerDelay = error.retryAfterMs;
  // 36009037 is the documented hourly quota. A missing/zero Retry-After does
  // not justify hammering an endpoint; other transient reads get one minute.
  const minimumDelay = error.code === 36009037 ? 3_600_000 : 60_000;
  const delay = Math.max(minimumDelay, headerDelay ?? 0);
  if (!Number.isFinite(delay) || !Number.isFinite(new Date(now + delay).getTime())) return undefined;
  return {
    reason: rateLimited ? 'rate_limit' : 'transient',
    notBefore: new Date(now + delay).toISOString(),
    upstreamStatus: error.status, upstreamCode: error.code,
    requestId: typeof error.requestId === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(error.requestId) ? error.requestId : null,
  };
}

export function pendingCompassRetry(now = Date.now()): CompassRetryInfo {
  return { reason:'pending',notBefore:new Date(now+60_000).toISOString(),upstreamStatus:null,upstreamCode:null,requestId:null };
}
