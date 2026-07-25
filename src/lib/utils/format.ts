import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfQuarter } from 'date-fns';
import type { DateRange, DateRangePreset } from '@/types';

/** Format a number as USD currency: $XX,XXX */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Format a number as exact USD currency with cents: $XX,XXX.XX */
export function formatCurrencyExact(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Format a number with commas: 1,234,567 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

/** Format a percentage: 12.5% */
export function formatPercent(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

/**
 * Engagement rate as a percentage: (likes + comments) / views × 100.
 * Returns 0 when views is 0 or missing — never NaN/Infinity.
 */
export function engagementRate(views: number, likes: number, comments: number): number {
  if (!views || views <= 0) return 0;
  return ((likes + comments) / views) * 100;
}

// ── TikTok watch URLs ────────────────────────────────────────────────────────
// THE canonical watch-URL format, in exactly one place. Mirrored in SQL by
// migration 119 (upsert_video_identities / upload_videos_atomic / the repair).
//
// Never trust an export's "Video link" column for this: TikTok now ships an
// EXPIRING SIGNED CDN URL there (https://v16m-default.tiktokcdn-us.com/<sig>/
// <hex-unix-expiry>/video/tos/...) with roughly a two-day life, on a host that
// doesn't even contain the substring 'tiktok.com'. The identity-derived form
// below is deterministic and permanent — verified in prod against all
// 1,690,866 already-canonical `videos` rows, byte for byte, 0 mismatches.

/** TikTok handle charset. Verified: 0 violations across 5.2M prod rows. */
const TIKTOK_HANDLE_RE = /^[A-Za-z0-9._]+$/;
const CANONICAL_WATCH_RE = /^https:\/\/www\.tiktok\.com\/@[A-Za-z0-9._]+\/video\/[0-9]+$/;

/**
 * Build the canonical TikTok watch URL for a video:
 * `https://www.tiktok.com/@{handle}/video/{videoId}`.
 *
 * Returns null — never a half-built string — when the handle is empty/junk or
 * the id isn't numeric. A missing link is honest; a broken one is not.
 */
export function canonicalVideoUrl(
  creatorName: string | null | undefined,
  videoId: string | number | null | undefined,
): string | null {
  const handle = String(creatorName ?? '').trim().replace(/^@+/, '');
  const id = String(videoId ?? '').trim();
  if (!TIKTOK_HANDLE_RE.test(handle)) return null;
  if (!/^[0-9]+$/.test(id)) return null;
  return `https://www.tiktok.com/@${handle}/video/${id}`;
}

/** True only for the exact canonical watch-URL shape built above. */
export function isCanonicalVideoUrl(url: string | null | undefined): boolean {
  return CANONICAL_WATCH_RE.test(String(url ?? '').trim());
}

/**
 * Pick the watch URL to render for a stored link + the video's identity.
 *
 * Order: an already-canonical stored link → the derived canonical link → a
 * non-canonical but genuinely tiktok.com link (e.g. a `/photo/` permalink) →
 * null. Expiring CDN media links and junk like '--' can never win, and a video
 * with usable identity can never come back null.
 */
export function resolveWatchUrl(
  storedUrl: string | null | undefined,
  creatorName: string | null | undefined,
  videoId: string | number | null | undefined,
): string | null {
  const stored = String(storedUrl ?? '').trim();
  if (isCanonicalVideoUrl(stored)) return stored;
  const derived = canonicalVideoUrl(creatorName, videoId);
  if (derived) return derived;
  return /^https:\/\/(www\.)?tiktok\.com\//.test(stored) ? stored : null;
}

/** Format a date for display */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'MMM d, yyyy');
}

/** Format a date as YYYY-MM-DD for API calls */
export function toISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** Current month as "YYYY-MM" in UTC. Used as the default month for earnings/invoicing surfaces. */
export function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Format a "YYYY-MM" string as a friendly month-year label, e.g. "April 2026". */
export function formatPeriod(ym: string, opts: { short?: boolean } = {}): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: opts.short ? 'short' : 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Build a list of recent month options for selectors: current + N prior months. */
export function buildMonthOptions(count = 13): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    opts.push({ value, label });
  }
  return opts;
}

/** Get a date range from a preset */
export function getDateRange(preset: DateRangePreset): DateRange {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { start: now, end: now, label: 'Today' };
    case 'yesterday':
      return { start: subDays(now, 1), end: subDays(now, 1), label: 'Yesterday' };
    case 'last7':
      return { start: subDays(now, 7), end: now, label: 'Last 7 days' };
    case 'last14':
      return { start: subDays(now, 14), end: now, label: 'Last 14 days' };
    case 'last30':
      return { start: subDays(now, 30), end: now, label: 'Last 30 days' };
    case 'thisMonth':
      return { start: startOfMonth(now), end: now, label: 'This month' };
    case 'lastMonth': {
      const lastM = subMonths(now, 1);
      return { start: startOfMonth(lastM), end: endOfMonth(lastM), label: 'Last month' };
    }
    case 'thisQuarter':
      return { start: startOfQuarter(now), end: now, label: 'This quarter' };
    default:
      return { start: subDays(now, 7), end: now, label: 'Last 7 days' };
  }
}
