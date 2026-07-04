import Link from 'next/link';
import { ArrowUpRight, ArrowDownRight, Building2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { getBrandRegistry, brandLabel, brandColor } from '@/lib/data/brand-registry';
import { SparklineChart } from '@/components/charts/sparkline-chart';

export interface BrandRowData {
  slug: string;
  currentGmv: number;
  /** GMV driven by managed creators only — i.e. the agency's contribution. */
  managedGmv: number;
  prevGmv: number;
  trend: number | undefined;
  sparkline: number[];
}

interface Props {
  brands: BrandRowData[];
  /** Pass through the current ?range= param so click-to-filter preserves the date range. */
  range?: string;
}

/**
 * Per-brand performance table — the agency-client view's most important section.
 * Lets a multi-brand operator see "which brand is up, which is down" at a glance,
 * and click any row to filter the dashboard to that brand. Only renders when the
 * tenant has >1 brand and no brand filter is currently applied.
 *
 * Two GMV columns: Total GMV (everything) and Managed GMV (just creators on
 * the agency's roster). The Managed column shows the % of total managed below
 * the dollar amount so the agency operator can see their contribution share
 * brand-by-brand.
 */
export async function BrandPerformance({ brands, range }: Props) {
  if (brands.length === 0) return null;

  const reg = await getBrandRegistry();

  // Sort by current GMV desc — most-impactful brands at the top.
  const rows = [...brands].sort((a, b) => b.currentGmv - a.currentGmv);
  const totalGmv = rows.reduce((s, b) => s + b.currentGmv, 0);

  function hrefFor(slug: string) {
    const params = new URLSearchParams();
    params.set('brand', slug);
    if (range) params.set('range', range);
    return `/dashboard?${params.toString()}`;
  }

  return (
    <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-200 flex items-center gap-2">
        <span className="h-7 w-7 rounded-lg bg-[#FF4D8D]/10 text-[#FF4D8D] flex items-center justify-center">
          <Building2 className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-extrabold tracking-tight text-[#1A1B3A]">Brand Performance</h3>
        <span className="text-xs text-gray-400 ml-auto">Click a brand to drill in</span>
      </div>

      {/* Column header row — anchors the two-GMV-column layout */}
      <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-4 px-5 py-2 border-b border-gray-50 bg-gray-50/40">
        <span className="w-2.5" />
        <span />
        <span className="hidden sm:block w-24" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 text-right min-w-[80px]">Total</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 text-right min-w-[90px]">Managed</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 text-right min-w-[68px]">Trend</span>
      </div>

      <div className="divide-y divide-gray-50">
        {rows.map((b) => {
          const color = brandColor(reg, b.slug);
          const name  = brandLabel(reg, b.slug);
          const sharePct = totalGmv > 0 ? (b.currentGmv / totalGmv) * 100 : 0;
          const managedPctOfBrand = b.currentGmv > 0
            ? (b.managedGmv / b.currentGmv) * 100
            : 0;
          const isPositive = b.trend !== undefined && b.trend >= 0;

          return (
            <Link
              key={b.slug}
              href={hrefFor(b.slug)}
              className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-4 px-5 py-3 hover:bg-gray-50/60 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D8D]/40 focus-visible:ring-inset"
            >
              {/* Brand color dot */}
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />

              {/* Brand name + share of portfolio */}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#1A1B3A] truncate group-hover:text-[#FF4D8D] transition-colors">
                  {name}
                </p>
                <p className="text-[11px] font-mono tabular-nums text-gray-400">{sharePct.toFixed(1)}% of portfolio</p>
              </div>

              {/* Sparkline */}
              <div className="hidden sm:block w-24">
                {b.sparkline.length > 1 ? (
                  <SparklineChart data={b.sparkline} color={color} height={28} />
                ) : (
                  <div className="h-[28px]" />
                )}
              </div>

              {/* Total GMV */}
              <p className="text-sm font-bold font-mono text-[#1A1B3A] tabular-nums text-right min-w-[80px]">
                {formatCurrency(b.currentGmv)}
              </p>

              {/* Managed GMV — what the agency is actually driving for this brand */}
              <div className="text-right min-w-[90px]">
                <p className="text-sm font-bold font-mono text-emerald-600 tabular-nums">
                  {formatCurrency(b.managedGmv)}
                </p>
                {b.currentGmv > 0 && (
                  <p className="text-[11px] font-mono text-gray-400 tabular-nums">
                    {managedPctOfBrand.toFixed(0)}% of total
                  </p>
                )}
              </div>

              {/* Trend */}
              <div className="min-w-[68px] text-right">
                {b.trend !== undefined ? (
                  <span
                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-semibold tabular-nums ${
                      isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                    }`}
                  >
                    {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {Math.abs(b.trend).toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-xs text-gray-300">—</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
