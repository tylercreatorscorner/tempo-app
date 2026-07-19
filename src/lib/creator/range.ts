/**
 * Creator-portal period-window helpers (pure — no 'use client', so server
 * components can call parseRange while the client RangePicker imports the
 * option list from the same source of truth).
 */

export const RANGE_OPTIONS = [7, 14, 30, 90] as const;

/** Coerce a `?range=` query value to a supported window; falls back to 30d. */
export function parseRange(raw: string | undefined, fallback = 30): number {
  const n = Number(raw);
  return (RANGE_OPTIONS as readonly number[]).includes(n) ? n : fallback;
}
