'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';
import { DollarSign, ShoppingCart, Package, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatNumber } from '@/lib/utils/format';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

export interface DailyMetrics {
  date: string;
  gmv: number;
  orders: number;
  items: number;
  videos: number;
}

type Metric = 'gmv' | 'orders' | 'items' | 'videos';

const METRICS: Array<{ key: Metric; label: string; icon: typeof DollarSign; color: string; format: (n: number) => string }> = [
  { key: 'gmv',    label: 'GMV',    icon: DollarSign,   color: '#E91E8C', format: (n) => formatCurrency(n) },
  { key: 'orders', label: 'Orders', icon: ShoppingCart, color: '#7C5CFC', format: (n) => formatNumber(n) },
  { key: 'items',  label: 'Items',  icon: Package,      color: '#00C853', format: (n) => formatNumber(n) },
  { key: 'videos', label: 'Posts',  icon: Video,        color: '#FF9800', format: (n) => formatNumber(n) },
];

function fmtLabel(dateStr: string) {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

interface Props {
  data: DailyMetrics[];
  /** Optional prior-period series for the comparison overlay */
  priorData?: DailyMetrics[];
  /** Override accent color (e.g. when filtered to a single brand) */
  accentColor?: string;
}

export function PerformanceChart({ data, priorData, accentColor }: Props) {
  const [metric, setMetric] = useState<Metric>('gmv');
  const [compare, setCompare] = useState(false);

  const cfg = METRICS.find((m) => m.key === metric)!;
  const color = accentColor ?? cfg.color;

  // Prior totals for the delta strip
  const priorTotal = (priorData ?? []).reduce((sum, row) => sum + row[metric], 0);

  // Day total — useful single-day fallback display
  const total = data.reduce((sum, row) => sum + row[metric], 0);

  const categories = data.map((d) => fmtLabel(d.date));
  const values = data.map((d) => Number(d[metric].toFixed(2)));
  // For comparison overlay: align prior data to current data positions by index
  const priorValues = compare && priorData && priorData.length === data.length
    ? priorData.map((d) => Number(d[metric].toFixed(2)))
    : null;

  const series = priorValues
    ? [
        { name: cfg.label, data: values, type: 'area' as const },
        { name: 'Prior period', data: priorValues, type: 'line' as const },
      ]
    : [{ name: cfg.label, data: values }];

  const options: ApexOptions = {
    chart: {
      type: 'area',
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true, speed: 250 },
      sparkline: { enabled: false },
    },
    stroke: { curve: 'smooth', width: priorValues ? [2.5, 1.5] : 2.5, dashArray: priorValues ? [0, 5] : undefined },
    fill: {
      type: priorValues ? ['gradient', 'solid'] : 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.35,
        opacityTo: 0.0,
        stops: [0, 100],
      },
      opacity: priorValues ? [1, 0] : 1,
    },
    colors: priorValues ? [color, '#9CA3AF'] : [color],
    legend: priorValues ? { show: true, position: 'top', horizontalAlign: 'right' } : { show: false },
    dataLabels: { enabled: false },
    grid: {
      borderColor: '#F3F4F6',
      strokeDashArray: 4,
      padding: { left: 10, right: 10, top: 0, bottom: 0 },
    },
    xaxis: {
      categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: { colors: '#9CA3AF', fontSize: '11px' },
        rotate: 0,
      },
    },
    yaxis: {
      labels: {
        style: { colors: '#9CA3AF', fontSize: '11px' },
        formatter: (val: number) => {
          if (metric === 'gmv') {
            if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
            if (val >= 1000) return `$${(val / 1000).toFixed(0)}k`;
            return `$${val.toFixed(0)}`;
          }
          if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
          return val.toFixed(0);
        },
      },
    },
    tooltip: {
      x: { show: true },
      y: { formatter: (val: number) => cfg.format(val) },
      theme: 'light',
    },
  };

  // % change vs prior period for the active metric
  const priorDelta =
    priorData && priorData.length > 0 && priorTotal > 0
      ? ((total - priorTotal) / priorTotal) * 100
      : null;

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
      {/* Header with metric toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-bold text-[#1A1B3A]">Performance Overview</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Total in period:{' '}
            <span className="font-semibold text-[#1A1B3A] tabular-nums">{cfg.format(total)}</span>
            {priorDelta !== null && (
              <span
                className={cn(
                  'ml-2 inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold',
                  priorDelta >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
                )}
              >
                {priorDelta >= 0 ? '+' : ''}{priorDelta.toFixed(1)}%
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Compare toggle */}
          {priorData && priorData.length > 1 && (
            <button
              onClick={() => setCompare(c => !c)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                compare
                  ? 'bg-[#1A1B3A] text-white border-[#1A1B3A]'
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              )}
              title="Overlay prior period"
            >
              <span className="h-2 w-3 border-t-2 border-dashed border-current" />
              Compare prior
            </button>
          )}

          {/* Metric toggle */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
            {METRICS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setMetric(key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                  metric === key
                    ? 'bg-white text-[#1A1B3A] shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      {data.length > 1 ? (
        <ApexChart options={options} series={series} type="area" height={280} />
      ) : data.length === 1 ? (
        <div className="h-[280px] flex flex-col items-center justify-center">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
            {cfg.label} — {new Date(data[0].date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
          </p>
          <p className="text-5xl font-extrabold mt-2" style={{ color }}>
            {cfg.format(values[0])}
          </p>
          <p className="text-xs text-gray-400 mt-2">Switch to a longer range to see a trend chart</p>
        </div>
      ) : (
        <div className="h-[280px] flex items-center justify-center text-sm text-gray-400">
          No data in this period
        </div>
      )}
    </div>
  );
}
