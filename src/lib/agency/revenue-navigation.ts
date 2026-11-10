import type { RevenueTrueUpRow } from './revenue-model';

/** A calculation drilldown must retain its service dates, not open last 30 days. */
export function revenueBrandDashboardHref(row: Pick<RevenueTrueUpRow, 'month' | 'throughDate' | 'agencyTerms'>, brandSlug: string): string | null {
  const period = row.agencyTerms?.servicePeriod;
  const start = period?.start ?? `${row.month}-01`;
  const end = period?.end && period.end < row.throughDate ? period.end : row.throughDate;
  if (end < start) return null;
  return `/dashboard?${new URLSearchParams({ brand: brandSlug, range: 'custom', start, end })}`;
}
