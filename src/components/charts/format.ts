// Shared value formatters for the Pulse chart kit (replaces the fmtY/fmtCompact/
// fmtVal helpers that were copy-pasted into every ApexCharts file).
import { formatCurrency, formatNumber } from '@/lib/utils/format';

/** Compact currency for axis ticks / dense labels: $1.2M, $48K, $920. */
export function fmtCompactCurrency(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `$${(v / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
}

/** Compact plain number: 1.2M, 48K, 920. */
export function fmtCompact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `${Math.round(v / 1_000)}K`;
  return `${Math.round(v)}`;
}

export { formatCurrency, formatNumber };

/** The kit's CVD-validated categorical slots (fixed order, never cycled). */
export const CAT_VARS = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)'] as const;

/** Color for series i: explicit override → provided color, else the categorical
 *  slot; single-series callers should pass ['var(--primary)']. */
export function seriesColor(i: number, override?: string): string {
  if (override) return override;
  return CAT_VARS[i % CAT_VARS.length];
}
