import type { ReactNode } from 'react';
import { ShoppingCart, Video, Users, TrendingUp, ArrowUpRight, ArrowDownRight, Newspaper, AlertTriangle, Flame, Star, CheckCircle2 } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { DayComparisonChart } from '@/components/charts/day-comparison-chart';

export interface DailyBriefActionItem {
  name: string;
  detail: string;
  type: 'underperforming' | 'breakout' | 'crushing';
}

interface Props {
  brandName: string | null;
  /** Friendly label for the *current* period (e.g. "Yesterday", "Last 7 days", "Apr 1 – Apr 30"). */
  periodLabel: string;
  /** Friendly label for the *prior* comparison period. */
  prevPeriodLabel: string;
  currentGmv: number;
  prevGmv: number;
  currentOrders: number;
  prevOrders: number;
  currentVideos: number;
  currentCreators: number;
  gmvTrend?: number;
  topCreator?: { name: string; gmv: number } | null;
  /** Top brand for this period — preferred over topCreator on All Brands view. */
  topBrand?: { name: string; gmv: number } | null;
  actionItems: DailyBriefActionItem[];
  color?: string;
}

/**
 * Period Brief — narrative-led hero card on the admin dashboard.
 * Works for any date range (single-day, multi-day, custom).
 */
export function DailyBrief({
  brandName,
  periodLabel,
  prevPeriodLabel,
  currentGmv,
  prevGmv,
  currentOrders,
  prevOrders,
  currentVideos,
  currentCreators,
  gmvTrend,
  topCreator,
  topBrand,
  actionItems,
  color = '#FF4D8D',
}: Props) {
  const name = brandName ?? 'Your portfolio';
  const isPositive = gmvTrend !== undefined && gmvTrend >= 0;
  // Lower-case "yesterday"/"last 7 days" mid-sentence; preserve exact period strings.
  const inlinePeriod = /^(Yesterday|Today|Last \d+ days?|This (?:week|month|quarter|year)|Last (?:week|month|quarter))$/i.test(periodLabel)
    ? periodLabel.toLowerCase()
    : periodLabel;

  let headline: string;
  if (currentGmv === 0) {
    headline = `No sales data for ${name} for ${inlinePeriod} yet — TikTok Shop data typically syncs within 24 hours.`;
  } else if (gmvTrend === undefined) {
    headline = `${name} generated ${formatCurrency(currentGmv)} ${inlinePeriod}.`;
  } else {
    const dir = isPositive ? 'up' : 'down';
    headline = `${name} generated ${formatCurrency(currentGmv)} ${inlinePeriod} — ${dir} ${Math.abs(gmvTrend).toFixed(1)}% from ${prevPeriodLabel}.`;
  }

  const ordersTrend =
    prevOrders > 0 ? ((currentOrders - prevOrders) / prevOrders) * 100 : undefined;

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-white">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-gray-50/80 to-white">
        <div className="flex items-center gap-2">
          <span className="h-7 w-7 rounded-lg bg-[#FF4D8D]/10 text-[#FF4D8D] flex items-center justify-center">
            <Newspaper className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-extrabold tracking-tight text-[#1A1B3A]">Period Brief</h3>
        </div>
        <span className="text-xs text-gray-400 font-medium tabular-nums">{periodLabel}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] divide-y lg:divide-y-0 lg:divide-x divide-gray-200">

        {/* Left: narrative */}
        <div className="p-5 space-y-4">
          {/* Headline */}
          <p className="text-[15px] font-semibold text-[#1A1B3A] leading-snug">
            {headline}
            {gmvTrend !== undefined && (
              <span className={`inline-flex items-center gap-0.5 ml-1 text-sm font-bold ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
              </span>
            )}
          </p>

          {/* Mini stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <MiniStat
              icon={<ShoppingCart className="h-3.5 w-3.5" />}
              label="Orders"
              value={formatNumber(currentOrders)}
              sub={ordersTrend !== undefined ? `${ordersTrend >= 0 ? '+' : ''}${ordersTrend.toFixed(1)}% vs prior` : undefined}
              subPositive={ordersTrend !== undefined ? ordersTrend >= 0 : undefined}
              color={color}
            />
            <MiniStat
              icon={<Video className="h-3.5 w-3.5" />}
              label="Videos"
              value={formatNumber(currentVideos)}
              color={color}
            />
            <MiniStat
              icon={<Users className="h-3.5 w-3.5" />}
              label="Creators"
              value={formatNumber(currentCreators)}
              color={color}
            />
            {topBrand ? (
              <MiniStat
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                label="Top Brand"
                value={topBrand.name}
                sub={formatCurrency(topBrand.gmv)}
                color={color}
              />
            ) : topCreator ? (
              <MiniStat
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                label="Top Creator"
                value={topCreator.name.split(' ')[0]}
                sub={formatCurrency(topCreator.gmv)}
                color={color}
              />
            ) : (
              <MiniStat
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                label="Avg Order"
                value={currentOrders > 0 ? formatCurrency(currentGmv / currentOrders) : '—'}
                color={color}
              />
            )}
          </div>

          {/* Action items */}
          {actionItems.length > 0 ? (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Action Items</p>
              <div className="space-y-1.5">
                {actionItems.slice(0, 3).map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0 mt-0.5">
                      {item.type === 'underperforming' ? (
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      ) : item.type === 'crushing' ? (
                        <Flame className="h-4 w-4 text-[#FF4D8D]" />
                      ) : (
                        <Star className="h-4 w-4 text-emerald-500" />
                      )}
                    </span>
                    <p className="text-gray-500 leading-snug">
                      <span className="font-semibold text-[#1A1B3A]">{item.name}</span>
                      {' — '}{item.detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : currentGmv > 0 ? (
            <p className="flex items-center gap-1.5 text-sm text-gray-400"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> No action items — your creators are on track.</p>
          ) : null}
        </div>

        {/* Right: GMV comparison chart */}
        <div className="p-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 px-1">
            GMV vs Prior Period
          </p>
          <DayComparisonChart
            currentGmv={currentGmv}
            previousGmv={prevGmv}
            currentLabel={periodLabel}
            previousLabel={prevPeriodLabel}
            color={color}
            height={170}
          />
          {/* Orders row */}
          <div className="flex items-center justify-between px-2 pt-2 border-t border-gray-200">
            <div>
              <p className="text-[10px] text-gray-400">Orders</p>
              <p className="text-sm font-bold text-[#1A1B3A] tabular-nums">{formatNumber(currentOrders)}</p>
            </div>
            {ordersTrend !== undefined && (
              <span className={`text-xs font-bold tabular-nums ${ordersTrend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {ordersTrend >= 0 ? '↑' : '↓'} {Math.abs(ordersTrend).toFixed(1)}%
              </span>
            )}
            <div className="text-right">
              <p className="text-[10px] text-gray-400">Prior</p>
              <p className="text-sm font-bold text-gray-400 tabular-nums">{formatNumber(prevOrders)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  sub,
  subPositive,
  color,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  subPositive?: boolean;
  color?: string;
}) {
  return (
    <div className="rounded-xl bg-gray-50/80 px-3 py-2.5 space-y-0.5">
      <div className="flex items-center gap-1">
        <span style={{ color: color ?? '#FF4D8D' }}>{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
      </div>
      <p className="text-sm font-bold text-[#1A1B3A] tabular-nums">{value}</p>
      {sub && (
        <p
          className={`text-[11px] font-mono tabular-nums ${
            subPositive === true
              ? 'text-emerald-600'
              : subPositive === false
              ? 'text-red-500'
              : 'text-gray-400'
          }`}
        >
          {sub}
        </p>
      )}
    </div>
  );
}
