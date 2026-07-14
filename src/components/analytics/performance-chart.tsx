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
  { key: 'gmv',    label: 'GMV',    icon: DollarSign,   color: '#8A8FB2', format: (n) => formatCurrency(n) },
  { key: 'orders', label: 'Orders', icon: ShoppingCart, color: '#A855F7', format: (n) => formatNumber(n) },
  { key: 'items',  label: 'Items',  icon: Package,      color: '#00C853', format: (n) => formatNumber(n) },
  { key: 'videos', label: 'Posts',  icon: Video,        color: '#FF9800', format: (n) => formatNumber(n) },
];

function fmtLabel(dateStr: string) {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

type CompareMode = 'off' | 'prior' | 'yoy';

interface Props {
  data: DailyMetrics[];
  /** Optional prior-period series (immediately preceding range, same length) */
  priorData?: DailyMetrics[];
  /** Optional same-period-last-year series (only passed if there's any non-zero data) */
  yoyData?: DailyMetrics[];
  /** Override accent color (e.g. when filtered to a single brand) */
  accentColor?: string;
}

export function PerformanceChart({ data, priorData, yoyData, accentColor }: Props) {
  const [metric, setMetric] = useState<Metric>('gmv');
  const [compare, setCompare] = useState<CompareMode>('off');

  const cfg = METRICS.find((m) => m.key === metric)!;
  const color = accentColor ?? cfg.color;

  // Day total — useful single-day fallback display
  const total = data.reduce((sum, row) => sum + row[metric], 0);

  const categories = data.map((d) => fmtLabel(d.date));
  const values = data.map((d) => Number(d[metric].toFixed(2)));

  // Comparison overlay aligns by index. Page.tsx zero-fills missing dates so
  // current/prior/YoY all share the same length — here we just trim to be safe.
  const overlay = (() => {
    if (compare === 'prior' && priorData?.length) {
      const trimmed = priorData.slice(0, data.length);
      return { name: 'Prior period', values: trimmed.map((d) => Number(d[metric].toFixed(2))) };
    }
    if (compare === 'yoy' && yoyData?.length) {
      const trimmed = yoyData.slice(0, data.length);
      return { name: 'Same period last year', values: trimmed.map((d) => Number(d[metric].toFixed(2))) };
    }
    return null;
  })();
  const overlayTotal = overlay ? overlay.values.reduce((s, v) => s + v, 0) : null;

  const series = overlay
    ? [
        { name: cfg.label, data: values, type: 'area' as const },
        { name: overlay.name, data: overlay.values, type: 'line' as const },
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
    stroke: { curve: 'smooth', width: overlay ? [2.5, 1.5] : 2.5, dashArray: overlay ? [0, 5] : undefined },
    fill: {
      type: overlay ? ['gradient', 'solid'] : 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.35,
        opacityTo: 0.0,
        stops: [0, 100],
      },
      opacity: overlay ? [1, 0] : 1,
    },
    colors: overlay ? [color, '#8A8FB2'] : [color],
    legend: overlay ? { show: true, position: 'top', horizontalAlign: 'right' } : { show: false },
    dataLabels: { enabled: false },
    grid: {
      borderColor: 'var(--muted)',
      strokeDashArray: 4,
      padding: { left: 10, right: 10, top: 0, bottom: 0 },
    },
    xaxis: {
      categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: { colors: '#8A8FB2', fontSize: '11px', fontFamily: 'var(--font-geist-mono)' },
        rotate: 0,
      },
    },
    yaxis: {
      labels: {
        style: { colors: '#8A8FB2', fontSize: '11px', fontFamily: 'var(--font-geist-mono)' },
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
      style: { fontFamily: 'var(--font-geist-mono)' },
    },
  };

  // % change vs the active overlay (prior period or YoY) for the active metric.
  // Falls back to prior period whenever no overlay is selected so the badge keeps showing.
  const fallbackPriorTotal = (priorData ?? []).reduce((s, r) => s + r[metric], 0);
  const compareTotal = overlayTotal ?? (priorData?.length ? fallbackPriorTotal : null);
  const compareDelta =
    compareTotal && compareTotal > 0
      ? ((total - compareTotal) / compareTotal) * 100
      : null;
  const compareBadgeLabel =
    compare === 'yoy' ? 'vs last year' : 'vs prior period';

  return (
    <div className="rounded-2xl bg-card border border-border shadow-sm p-5">
      {/* Header with metric toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-extrabold tracking-tight text-[#8A8FB2]">Performance Overview</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Total in period:{' '}
            <span className="font-semibold text-[#8A8FB2] font-mono tabular-nums">{cfg.format(total)}</span>
            {compareDelta !== null && (
              <span
                className={cn(
                  'ml-2 inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold font-mono tabular-nums',
                  compareDelta >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                )}
                title={compareBadgeLabel}
              >
                {compareDelta >= 0 ? '+' : ''}{compareDelta.toFixed(1)}%
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Compare toggle — segmented "off / prior / YoY" pill (YoY hidden when no data) */}
          {(priorData?.length ?? 0) > 1 && (
            <div className="flex gap-0.5 p-0.5 bg-muted rounded-lg" role="group" aria-label="Compare overlay">
              {([
                { key: 'off',   label: 'No compare' },
                { key: 'prior', label: 'Prior' },
                ...(yoyData?.length ? [{ key: 'yoy' as const, label: 'YoY' }] : []),
              ] as Array<{ key: CompareMode; label: string }>).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setCompare(key)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D5EFC]/40 focus-visible:ring-offset-1',
                    compare === key
                      ? 'bg-card text-[#8A8FB2] shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  aria-pressed={compare === key}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Metric toggle */}
          <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
            {METRICS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setMetric(key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D5EFC]/40 focus-visible:ring-offset-1',
                  metric === key
                    ? 'bg-card text-[#8A8FB2] shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                aria-pressed={metric === key}
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
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {cfg.label} — {new Date(data[0].date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
          </p>
          <p className="text-5xl font-extrabold font-mono tabular-nums mt-2" style={{ color }}>
            {cfg.format(values[0])}
          </p>
          <p className="text-xs text-muted-foreground mt-2">Switch to a longer range to see a trend chart</p>
        </div>
      ) : (
        <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
          No data in this period
        </div>
      )}
    </div>
  );
}
