/**
 * Brand-portal period type + labels. PURE (no imports) so CLIENT components
 * (period-tabs, report-builder) can import them WITHOUT pulling the server-side
 * brand-portal data fetchers — and their registry/`next/headers` reach — into
 * the client bundle. brand-portal-overview re-exports these for server callers.
 */
export type BrandPortalPeriod =
  | 'yesterday'
  | '7d'
  | '30d'
  | 'this_month'
  | 'last_month';

export const PERIOD_LABELS: Record<BrandPortalPeriod, string> = {
  yesterday: 'Yesterday',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  this_month: 'This month',
  last_month: 'Last month',
};
