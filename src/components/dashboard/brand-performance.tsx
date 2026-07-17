import Link from 'next/link';
import { formatCurrency } from '@/lib/utils/format';
import { getBrandRegistry, brandLabel, brandColor } from '@/lib/data/brand-registry';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { InfoTooltip } from '@/components/ui/info-tooltip';
// Via the client wrapper, not Sparkline directly: this is a server component and
// Sparkline's `format` prop is a function, which can't cross the boundary.
import { BrandSparkline } from '@/components/dashboard/brand-sparkline';

export interface BrandRowData {
  slug: string;
  currentGmv: number;
  /** GMV driven by managed creators only — i.e. the agency's contribution. */
  managedGmv: number;
  prevGmv: number;
  /** Managed GMV in the previous period of equal length. */
  prevManagedGmv: number;
  /** Total GMV vs the previous period. */
  trend: number | undefined;
  /** Managed GMV vs the previous period — the agency's own momentum. */
  managedTrend: number | undefined;
  /** This brand's monthly retainer spend. */
  retainer: number;
  /** Trailing-30d managed GMV / this brand's monthly retainer. */
  roi?: number;
  /** Daily total GMV across the selected range, zero-filled, index-aligned to `days`. */
  series?: number[];
  days?: string[];
}

interface Props {
  brands: BrandRowData[];
  /** Pass through the current date params so click-to-filter preserves the range —
   *  including start/end, without which a custom range silently reverts to last7. */
  range?: string;
  start?: string;
  end?: string;
  /** Period length in days — labels the sparkline column. */
  periodLength?: number;
}

const TH = 'text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground';
// Brand | GMV | Δ | sparkline | Managed | Δ | Mgd% | Retainer | ROI
const COLS = 'grid grid-cols-[minmax(120px,1fr)_auto_auto_auto_auto_auto_auto_auto_auto] items-center gap-x-4';

/** Right-aligned column header with a hover tooltip explaining the metric. */
function HeadCell({ label, tip, width }: { label: string; tip: string; width: string }) {
  return (
    <InfoTooltip label={tip}>
      <span className={`${TH} ${width} cursor-help text-right underline decoration-muted-foreground/30 decoration-dotted underline-offset-2`}>
        {label}
      </span>
    </InfoTooltip>
  );
}

/** Inline period-over-period delta. Sub-1% keeps a decimal so a real move
 *  doesn't render as a flat 0%. */
function Delta({ value, width }: { value: number | undefined; width: string }) {
  if (value === undefined) return <span className={`${width} text-right text-[13px] text-muted-foreground`}>—</span>;
  const pos = value >= 0;
  return (
    <span
      className={`${width} text-right text-[13px] font-bold tabular-nums`}
      style={{ color: pos ? 'var(--pulse-pos)' : 'var(--pulse-neg)' }}
    >
      {pos ? '▲' : '▼'}{Math.abs(value) < 1 ? Math.abs(value).toFixed(1) : Math.round(Math.abs(value))}%
    </span>
  );
}

/**
 * Per-brand performance table — the agency-client view's key section.
 *
 * Columns: Brand · GMV · Δ · sparkline · Managed · Δ · Mgd% · Retainer · ROI.
 *
 * TWO deltas by design: total GMV says how the BRAND is doing, managed GMV says
 * how WE are doing on it. A brand can be up while our share of it falls, and a
 * single trend column hides exactly that. Retainer is ROI's denominator, shown
 * so the ratio is auditable instead of asserted.
 *
 * Renders EVERY brand, including those at $0 managed: a brand you have no
 * managed creators on is a coverage gap worth seeing, not noise to hide.
 */
export async function BrandPerformance({ brands, range, start, end, periodLength }: Props) {
  if (brands.length === 0) return null;

  const reg = await getBrandRegistry();
  // Sort by current GMV desc — most-impactful brands at the top.
  const rows = [...brands].sort((a, b) => b.currentGmv - a.currentGmv);
  const sparkLabel = periodLength ? `${periodLength}d` : 'Trend';

  function hrefFor(slug: string) {
    const params = new URLSearchParams();
    params.set('brand', slug);
    if (range) params.set('range', range);
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    return `/dashboard?${params.toString()}`;
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle eyebrow>Brand Performance</CardTitle>
        <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
          {rows.length} {rows.length === 1 ? 'brand' : 'brands'}
        </span>
      </CardHeader>

      {/* Column headers — each metric header hover-explains itself */}
      <div className={`${COLS} border-b border-border px-5 py-2`}>
        <span className={TH}>Brand</span>
        <HeadCell label="GMV"      width="min-w-[76px]" tip="Total affiliate GMV for this brand in the selected period." />
        <HeadCell label="Δ"        width="min-w-[46px]" tip="Total GMV vs the previous period of equal length." />
        <span className={`${TH} min-w-[88px] text-right`}>{sparkLabel}</span>
        <HeadCell label="Managed"  width="min-w-[76px]" tip="GMV from your managed creators for this brand, in the selected period." />
        <HeadCell label="Δ"        width="min-w-[46px]" tip="Managed GMV vs the previous period — your own momentum on this brand, independent of how the brand is doing overall." />
        <HeadCell label="Mgd %"    width="min-w-[42px]" tip="Managed GMV as a share of this brand's total GMV." />
        <HeadCell label="Retainer" width="min-w-[72px]" tip="What this brand pays you per month — the denominator of ROI." />
        <HeadCell label="ROI"      width="min-w-[42px]" tip="Trailing-30-day managed GMV divided by this brand's monthly retainer (a fixed 30-day window, independent of the period above)." />
      </div>

      <div className="divide-y divide-border">
        {rows.map((b) => {
          const color = brandColor(reg, b.slug);
          const name = brandLabel(reg, b.slug);
          const managedPct = b.currentGmv > 0 ? (b.managedGmv / b.currentGmv) * 100 : 0;

          return (
            <Link
              key={b.slug}
              href={hrefFor(b.slug)}
              className={`${COLS} group px-5 py-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40 focus-visible:ring-inset`}
            >
              {/* Brand — square color dot + name */}
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="h-2.5 w-2.5 flex-shrink-0 rounded-[3px]" style={{ backgroundColor: color }} />
                <span className="truncate text-[13.5px] font-bold text-foreground transition-colors group-hover:text-[var(--primary)]">
                  {name}
                </span>
              </span>

              {/* Total GMV + its delta */}
              <span className="min-w-[76px] text-right text-[13.5px] font-semibold tabular-nums text-foreground">
                {formatCurrency(b.currentGmv)}
              </span>
              <Delta value={b.trend} width="min-w-[46px]" />

              {/* Shape of the period. Same source as the GMV figure two columns
                  left, so the line can't disagree with the number beside it. */}
              <span className="flex min-w-[88px] justify-end">
                <BrandSparkline data={b.series} days={b.days} color={color} />
              </span>

              {/* Managed GMV + its delta */}
              <span className="min-w-[76px] text-right text-[13.5px] font-semibold tabular-nums text-foreground">
                {formatCurrency(b.managedGmv)}
              </span>
              <Delta value={b.managedTrend} width="min-w-[46px]" />

              {/* Managed share of the brand's total GMV */}
              <span className="min-w-[42px] text-right text-[13px] font-semibold tabular-nums text-muted-foreground">
                {b.currentGmv > 0 ? `${managedPct.toFixed(0)}%` : '—'}
              </span>

              {/* Monthly retainer spend — ROI's denominator, shown */}
              <span className="min-w-[72px] text-right text-[13px] font-semibold tabular-nums text-muted-foreground">
                {b.retainer > 0 ? formatCurrency(b.retainer) : '—'}
              </span>

              {/* ROI — trailing-30d managed GMV / monthly retainer */}
              <span className="min-w-[42px] text-right text-[13.5px] font-semibold tabular-nums text-foreground">
                {b.roi != null && b.roi > 0 ? `${b.roi.toFixed(1)}×` : '—'}
              </span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
