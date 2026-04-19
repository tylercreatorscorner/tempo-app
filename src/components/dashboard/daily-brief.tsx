import type { ReactNode } from 'react';
import { ShoppingCart, Video, Users, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { DayComparisonChart } from '@/components/charts/day-comparison-chart';

export interface DailyBriefActionItem {
  name: string;
  detail: string;
  type: 'warning' | 'breakout' | 'crushing';
}

interface Props {
  brandName: string | null;
  date: string;
  prevDateLabel: string;
  currentGmv: number;
  prevGmv: number;
  currentOrders: number;
  prevOrders: number;
  currentVideos: number;
  currentCreators: number;
  gmvTrend?: number;
  topCreator?: { name: string; gmv: number } | null;
  actionItems: DailyBriefActionItem[];
  color?: string;
}

export function DailyBrief({
  brandName,
  date,
  prevDateLabel,
  currentGmv,
  prevGmv,
  currentOrders,
  prevOrders,
  currentVideos,
  currentCreators,
  gmvTrend,
  topCreator,
  actionItems,
  color = '#FF4D8D',
}: Props) {
  const name = brandName ?? 'Your portfolio';
  const isPositive = gmvTrend !== undefined && gmvTrend >= 0;

  let headline: string;
  if (currentGmv === 0) {
    headline = `No sales data for ${name} on ${date} yet — TikTok Shop data typically syncs within 24 hours. Try Last 7 Days for current data.`;
  } else if (gmvTrend === undefined) {
    headline = `${name} generated ${formatCurrency(currentGmv)} yesterday.`;
  } else {
    const dir = isPositive ? 'up' : 'down';
    headline = `${name} generated ${formatCurrency(currentGmv)} yesterday — ${dir} ${Math.abs(gmvTrend).toFixed(1)}% from ${prevDateLabel}.`;
  }

  const ordersTrend =
    prevOrders > 0 ? ((currentOrders - prevOrders) / prevOrders) * 100 : undefined;

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-white">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50/80 to-white">
        <div className="flex items-center gap-2">
          <span className="text-base">📰</span>
          <h3 className="font-semibold text-[#1A1B3A] text-sm">Daily Brief</h3>
        </div>
        <span className="text-xs text-gray-400 font-medium">{date}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] divide-y lg:divide-y-0 lg:divide-x divide-gray-100">

        {/* Left: narrative */}
        <div className="p-5 space-y-4">
          {/* Headline */}
          <p className="text-[15px] font-semibold text-[#1A1B3A] leading-snug">
            {headline}
            {gmvTrend !== undefined && (
              <span className={`inline-flex items-center gap-0.5 ml-1 text-sm font-bold ${isPositive ? 'text-emerald-500' : 'text-red-400'}`}>
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
            {topCreator ? (
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
                      {item.type === 'warning' ? '⚠️' : item.type === 'crushing' ? '🔥' : '⭐'}
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
            <p className="text-sm text-gray-400">✅ No action items — your creators are on track.</p>
          ) : null}
        </div>

        {/* Right: GMV comparison chart */}
        <div className="p-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 px-1">
            GMV vs Prior Day
          </p>
          <DayComparisonChart
            currentGmv={currentGmv}
            previousGmv={prevGmv}
            currentLabel="Yesterday"
            previousLabel={prevDateLabel}
            color={color}
            height={170}
          />
          {/* Orders row */}
          <div className="flex items-center justify-between px-2 pt-2 border-t border-gray-100">
            <div>
              <p className="text-[10px] text-gray-400">Orders yesterday</p>
              <p className="text-sm font-bold text-[#1A1B3A]">{formatNumber(currentOrders)}</p>
            </div>
            {ordersTrend !== undefined && (
              <span className={`text-xs font-bold ${ordersTrend >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                {ordersTrend >= 0 ? '↑' : '↓'} {Math.abs(ordersTrend).toFixed(1)}%
              </span>
            )}
            <div className="text-right">
              <p className="text-[10px] text-gray-400">Prior day</p>
              <p className="text-sm font-bold text-gray-400">{formatNumber(prevOrders)}</p>
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
      <p className="text-sm font-bold text-[#1A1B3A]">{value}</p>
      {sub && (
        <p
          className={`text-[10px] font-medium ${
            subPositive === true
              ? 'text-emerald-500'
              : subPositive === false
              ? 'text-red-400'
              : 'text-gray-400'
          }`}
        >
          {sub}
        </p>
      )}
    </div>
  );
}
