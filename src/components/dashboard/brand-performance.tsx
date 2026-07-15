import Link from 'next/link';
import { formatCurrency } from '@/lib/utils/format';
import { getBrandRegistry, brandLabel, brandColor } from '@/lib/data/brand-registry';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

export interface BrandRowData {
  slug: string;
  currentGmv: number;
  /** GMV driven by managed creators only — i.e. the agency's contribution. */
  managedGmv: number;
  prevGmv: number;
  trend: number | undefined;
  sparkline: number[];
  /** Trailing-30d managed GMV ÷ this brand's monthly retainer. */
  roi?: number;
}

interface Props {
  brands: BrandRowData[];
  /** Pass through the current ?range= param so click-to-filter preserves the date range. */
  range?: string;
}

const TH = 'text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground';
const COLS = 'grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4';

/**
 * Per-brand performance table (Pulse mockup) — the agency-client view's key
 * section. Columns: Brand · GMV · Managed · ROI · Trend. Click any row to filter
 * the dashboard to that brand. Only renders with >1 brand and no brand filter.
 */
export async function BrandPerformance({ brands, range }: Props) {
  if (brands.length === 0) return null;

  const reg = await getBrandRegistry();
  // Sort by current GMV desc — most-impactful brands at the top.
  const rows = [...brands].sort((a, b) => b.currentGmv - a.currentGmv);

  function hrefFor(slug: string) {
    const params = new URLSearchParams();
    params.set('brand', slug);
    if (range) params.set('range', range);
    return `/dashboard?${params.toString()}`;
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle eyebrow>Brand Performance · 30d</CardTitle>
        <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
          {rows.length} {rows.length === 1 ? 'brand' : 'brands'}
        </span>
      </CardHeader>

      {/* Column headers */}
      <div className={`${COLS} border-b border-border px-5 py-2`}>
        <span className={TH}>Brand</span>
        <span className={`${TH} min-w-[84px] text-right`}>GMV</span>
        <span className={`${TH} min-w-[84px] text-right`}>Managed</span>
        <span className={`${TH} min-w-[52px] text-right`}>ROI</span>
        <span className={`${TH} min-w-[60px] text-right`}>Trend</span>
      </div>

      <div className="divide-y divide-border">
        {rows.map((b) => {
          const color = brandColor(reg, b.slug);
          const name = brandLabel(reg, b.slug);
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
              <span className="min-w-[84px] text-right text-[13.5px] font-semibold tabular-nums text-foreground">
                {formatCurrency(b.currentGmv)}
              </span>

              {/* Managed GMV — the agency's contribution for this brand */}
              <span className="min-w-[84px] text-right text-[13.5px] font-semibold tabular-nums text-foreground">
                {formatCurrency(b.managedGmv)}
              </span>

              {/* ROI — trailing-30d managed GMV ÷ monthly retainer */}
              <span className="min-w-[52px] text-right text-[13.5px] font-semibold tabular-nums text-foreground">
                {b.roi != null && b.roi > 0 ? `${b.roi.toFixed(1)}×` : '—'}
              </span>

              {/* Trend — inline colored delta with a filled triangle */}
              <span className="min-w-[60px] text-right text-[13px] font-bold tabular-nums">
                {b.trend !== undefined ? (
                  <span style={{ color: isPositive ? 'var(--pulse-pos)' : 'var(--pulse-neg)' }}>
                    {isPositive ? '▲' : '▼'}{Math.round(Math.abs(b.trend))}%
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
