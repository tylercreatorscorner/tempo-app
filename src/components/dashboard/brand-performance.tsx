import Link from 'next/link';
import { formatCurrency } from '@/lib/utils/format';
import { getBrandRegistry, brandLabel, brandColor } from '@/lib/data/brand-registry';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { InfoTooltip } from '@/components/ui/info-tooltip';

export interface BrandRowData {
  slug: string;
  currentGmv: number;
  /** GMV driven by managed creators only — i.e. the agency's contribution. */
  managedGmv: number;
  prevGmv: number;
  trend: number | undefined;
  /** Trailing-30d managed GMV / this brand's monthly retainer. */
  roi?: number;
}

interface Props {
  brands: BrandRowData[];
  /** Pass through the current date params so click-to-filter preserves the range —
   *  including start/end, without which a custom range silently reverts to last7. */
  range?: string;
  start?: string;
  end?: string;
}

const TH = 'text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground';
const COLS = 'grid grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-3';

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

/**
 * Per-brand performance table (Pulse mockup) — the agency-client view's key
 * section. Columns: Brand · GMV · Managed · Mgd% · ROI · Trend. Click any row to
 * filter the dashboard to that brand. Only renders with >1 brand and no filter.
 * Column headers carry tooltips defining each metric.
 */
export async function BrandPerformance({ brands, range, start, end }: Props) {
  if (brands.length === 0) return null;

  const reg = await getBrandRegistry();
  // Sort by current GMV desc — most-impactful brands at the top.
  const rows = [...brands].sort((a, b) => b.currentGmv - a.currentGmv);

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
        <HeadCell label="GMV" width="min-w-[76px]" tip="Total affiliate GMV for this brand in the selected period." />
        <HeadCell label="Managed" width="min-w-[76px]" tip="GMV from your managed creators for this brand, in the selected period." />
        <HeadCell label="Mgd %" width="min-w-[44px]" tip="Managed GMV as a share of this brand's total GMV." />
        <HeadCell label="ROI" width="min-w-[44px]" tip="Trailing-30-day managed GMV divided by this brand's monthly retainer (a fixed 30-day window)." />
        <HeadCell label="Trend" width="min-w-[54px]" tip="This brand's total GMV vs the previous period of equal length." />
      </div>

      <div className="divide-y divide-border">
        {rows.map((b) => {
          const color = brandColor(reg, b.slug);
          const name = brandLabel(reg, b.slug);
          const managedPct = b.currentGmv > 0 ? (b.managedGmv / b.currentGmv) * 100 : 0;
          const isPositive = b.trend !== undefined && b.trend >= 0;

          return (
            <Link
              key={b.slug}
              href={hrefFor(b.slug)}
              className={`${COLS} group px-5 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40 focus-visible:ring-inset`}
            >
              {/* Brand — square color dot + name */}
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="h-2.5 w-2.5 flex-shrink-0 rounded-[3px]" style={{ backgroundColor: color }} />
                <span className="truncate text-[13.5px] font-bold text-foreground transition-colors group-hover:text-[var(--primary)]">
                  {name}
                </span>
              </span>

              {/* Total GMV */}
              <span className="min-w-[76px] text-right text-[13.5px] font-semibold tabular-nums text-foreground">
                {formatCurrency(b.currentGmv)}
              </span>

              {/* Managed GMV — the agency's contribution for this brand */}
              <span className="min-w-[76px] text-right text-[13.5px] font-semibold tabular-nums text-foreground">
                {formatCurrency(b.managedGmv)}
              </span>

              {/* Managed share of the brand's total GMV */}
              <span className="min-w-[44px] text-right text-[13px] font-semibold tabular-nums text-muted-foreground">
                {b.currentGmv > 0 ? `${managedPct.toFixed(0)}%` : '—'}
              </span>

              {/* ROI — trailing-30d managed GMV ÷ monthly retainer */}
              <span className="min-w-[44px] text-right text-[13.5px] font-semibold tabular-nums text-foreground">
                {b.roi != null && b.roi > 0 ? `${b.roi.toFixed(1)}×` : '—'}
              </span>

              {/* Trend — inline colored delta with a filled triangle */}
              <span className="min-w-[54px] text-right text-[13px] font-bold tabular-nums">
                {b.trend !== undefined ? (
                  <span style={{ color: isPositive ? 'var(--pulse-pos)' : 'var(--pulse-neg)' }}>
                    {isPositive ? '▲' : '▼'}{Math.abs(b.trend) < 1 ? Math.abs(b.trend).toFixed(1) : Math.round(Math.abs(b.trend))}%
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
