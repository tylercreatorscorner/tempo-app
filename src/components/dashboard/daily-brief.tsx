import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import { format } from 'date-fns';
import { Newspaper, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';

interface BrandTrend {
  brand: string;
  gmv: number;
  trend: number;
}

interface TopCreator {
  creator_name: string;
  total_gmv: number;
}

interface TopProduct {
  product_name: string;
  total_gmv: number;
}

interface TopVideo {
  video_title: string;
  creator_name: string;
  total_gmv: number;
}

interface Props {
  totalGmv: number;
  gmvTrend?: number;
  yesterdayGmv: number;
  totalCreators: number;
  totalVideos: number;
  brandTrends: BrandTrend[];
  topCreator: TopCreator | null;
  topProduct: TopProduct | null;
  topVideo: TopVideo | null;
  startDate: string;
  endDate: string;
}

function bn(brand: string) {
  return BRAND_DISPLAY_NAMES[brand] ?? brand;
}

export function DailyBrief({
  totalGmv,
  gmvTrend,
  yesterdayGmv,
  totalCreators,
  totalVideos,
  brandTrends,
  topCreator,
  topProduct,
  topVideo,
  startDate,
  endDate,
}: Props) {
  const now = new Date();
  const generatedAt = format(now, "h:mm a 'CT'");
  const briefRange = `${format(new Date(startDate), 'MMM d')}–${format(new Date(endDate), 'MMM d, yyyy')}`;

  // Derive narrative lines
  const narrativeLines: string[] = [];

  // Portfolio headline
  const direction = gmvTrend !== undefined ? (gmvTrend >= 0 ? 'up' : 'down') : null;
  const trendStr = gmvTrend !== undefined ? `${Math.abs(gmvTrend).toFixed(1)}%` : '';
  if (direction) {
    narrativeLines.push(
      `Portfolio GMV was ${formatCurrency(totalGmv)} this period, ${direction} ${trendStr} from the prior period. ${formatNumber(totalCreators)} creators produced ${formatNumber(totalVideos)} videos.`
    );
  } else {
    narrativeLines.push(
      `Portfolio GMV was ${formatCurrency(totalGmv)} this period across ${formatNumber(totalCreators)} active creators.`
    );
  }

  // Per-brand callouts — sort by absolute trend magnitude for interest
  const sortedBrands = [...brandTrends].sort((a, b) => Math.abs(b.trend) - Math.abs(a.trend));
  for (const b of sortedBrands.slice(0, 3)) {
    if (b.gmv === 0) continue;
    const dir = b.trend >= 0 ? 'up' : 'down';
    narrativeLines.push(
      `${bn(b.brand)} posted ${formatCurrency(b.gmv)} (${dir} ${Math.abs(b.trend).toFixed(1)}% WoW).`
    );
  }

  // Top performer
  if (topCreator && topCreator.total_gmv > 0) {
    narrativeLines.push(
      `Top performer: @${topCreator.creator_name} generated ${formatCurrency(topCreator.total_gmv)} in GMV.`
    );
  }

  // Product spotlight
  if (topProduct && topProduct.total_gmv > 0) {
    const name = topProduct.product_name.length > 60
      ? topProduct.product_name.slice(0, 57) + '...'
      : topProduct.product_name;
    narrativeLines.push(
      `Product spotlight: "${name}" led with ${formatCurrency(topProduct.total_gmv)} in revenue.`
    );
  }

  // Risk flags — brands down >20%
  const riskBrands = brandTrends.filter((b) => b.trend < -20 && b.gmv > 0);
  const atRiskLines = riskBrands.map(
    (b) => `${bn(b.brand)} down ${Math.abs(b.trend).toFixed(0)}% — investigate creator activity`
  );

  return (
    <div className="rounded-2xl overflow-hidden border border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.25)] bg-gradient-to-br from-[#1a1a1f] via-[#16161a] to-[#111114]">
      {/* Masthead */}
      <div className="px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-600/5 flex items-center justify-center">
              <Newspaper className="h-4.5 w-4.5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-[0.2em] uppercase text-white/90" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
                The Daily Brief
              </h2>
              <p className="text-[10px] text-muted-foreground/40 tracking-wider uppercase mt-0.5">
                Tempo Intelligence Report
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground/50 font-medium">
              Brief for {briefRange}
            </p>
            <p className="text-[10px] text-muted-foreground/30">
              Generated at {generatedAt}
            </p>
          </div>
        </div>
        {/* Decorative rule */}
        <div className="mt-3 flex gap-0.5">
          <div className="h-[2px] flex-1 bg-amber-500/30" />
          <div className="h-[2px] w-8 bg-amber-500/60" />
          <div className="h-[2px] flex-1 bg-amber-500/30" />
        </div>
      </div>

      {/* Narrative body */}
      <div className="p-6">
        <div className="space-y-3" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
          {narrativeLines.map((line, i) => (
            <p
              key={i}
              className={`text-sm leading-relaxed ${
                i === 0
                  ? 'text-white/90 text-base font-medium'
                  : 'text-white/65'
              }`}
            >
              {i === 0 && <span className="text-3xl font-bold text-amber-400/80 float-left mr-2 mt-0.5 leading-none" style={{ fontFamily: 'Georgia, serif' }}>{line[0]}</span>}
              {i === 0 ? line.slice(1) : line}
            </p>
          ))}
        </div>

        {/* Risk flags */}
        {atRiskLines.length > 0 && (
          <div className="mt-5 rounded-xl bg-red-500/[0.06] border border-red-500/[0.15] p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-400/80">Risk Flags</span>
            </div>
            <ul className="space-y-1">
              {atRiskLines.map((line, i) => (
                <li key={i} className="text-sm text-red-300/70" style={{ fontFamily: 'Georgia, serif' }}>
                  ⚠ {line}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Bottom ticker — brand strip */}
        <div className="mt-5 pt-4 border-t border-white/[0.06] flex flex-wrap gap-4">
          {brandTrends.map((b) => (
            <div key={b.brand} className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground/50 font-medium">{bn(b.brand)}</span>
              <span className="font-semibold text-white/80">{formatCurrency(b.gmv)}</span>
              {b.trend >= 0 ? (
                <span className="flex items-center text-green-400">
                  <TrendingUp className="h-3 w-3 mr-0.5" />
                  +{b.trend.toFixed(1)}%
                </span>
              ) : (
                <span className="flex items-center text-red-400">
                  <TrendingDown className="h-3 w-3 mr-0.5" />
                  {b.trend.toFixed(1)}%
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
