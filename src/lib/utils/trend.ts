/**
 * Period-over-period trend math, shared across the dashboard + analytics pages.
 *
 * Returns `undefined` when there's no usable signal (both periods zero) so
 * callers can hide the trend badge instead of showing a misleading 0% or 100%.
 */
export function pctChange(current: number, previous: number): number | undefined {
  if (previous === 0) return current > 0 ? 100 : undefined;
  return ((current - previous) / previous) * 100;
}
