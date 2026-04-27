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
  /** Override accent color (e.g. when filtered to a single brand) */
  accentColor?: string;
}

export function PerformanceChart({ data, accentColor }: Props) {
  const [metric, setMetric] = useState<Metric>('gmv');

  const cfg = METRICS.find((m) => m.key === metric)!;
  const color = accentColor ?? cfg.color;

  // Day total — useful single-day fallback display
  const total = data.reduce((sum, row) => sum + row[metric], 0);

  const categories = data.map((d) => fmtLabel(d.date));
  const values = data.map((d) => Number(d[metric].toFixed(2)));

  const options: ApexOptions = {
    chart: {
      type: 'area',
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true, speed: 250 },
      sparkline: { enabled: false },
    },
    stroke: { curve: 'smooth', width: 2.5 },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.35,
        opacityTo: 0.0,
        stops: [0, 100],
      },
    },
    colors: [color],
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

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
      {/* Header with metric toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-bold text-[#1A1B3A]">Performance Overview</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Total in period:{' '}
            <span className="font-semibold text-[#1A1B3A] tabular-nums">{cfg.format(total)}</span>
          </p>
        </div>

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

      {/* Chart */}
      {data.length > 1 ? (
        <ApexChart options={options} series={[{ name: cfg.label, data: values }]} type="area" height={280} />
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
