'use client';

import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

export interface SeriesPoint {
  month: string;
  earnings: number;
  commission: number;
  retainers: number;
  launchFees: number;
}

interface Props {
  data: SeriesPoint[];
  height?: number;
  /** Highlight a specific month (vertical line + tooltip default). */
  activeMonth?: string;
}

function fmtY(val: number) {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(0)}k`;
  return `$${val.toFixed(0)}`;
}

function fmtMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

export function EarningsTrendChart({ data, height = 280, activeMonth }: Props) {
  if (!data || data.length === 0) return null;

  const categories = data.map((p) => fmtMonth(p.month));
  const monthKeys = data.map((p) => p.month);
  const activeIdx = activeMonth ? monthKeys.indexOf(activeMonth) : -1;

  const options: ApexOptions = {
    chart: {
      type: 'area',
      stacked: true,
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true, speed: 600 },
      fontFamily: 'inherit',
      background: 'transparent',
    },
    colors: ['#FF4D8D', '#7C5CFC', '#FF9800'],
    stroke: { curve: 'smooth', width: 2 },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        type: 'vertical',
        opacityFrom: 0.55,
        opacityTo: 0.05,
      },
    },
    dataLabels: { enabled: false },
    legend: {
      position: 'top',
      horizontalAlign: 'right',
      fontSize: '12px',
      fontWeight: 500,
      labels: { colors: '#6B7280' },
      markers: { size: 6 },
      itemMargin: { horizontal: 8 },
    },
    xaxis: {
      type: 'category',
      categories,
      labels: { style: { colors: '#9CA3AF', fontSize: '11px' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
      crosshairs: { show: true, stroke: { color: '#E5E7EB', width: 1, dashArray: 4 } },
    },
    yaxis: {
      labels: { style: { colors: '#9CA3AF', fontSize: '11px' }, formatter: fmtY },
      forceNiceScale: true,
    },
    grid: {
      borderColor: '#F3F4F6',
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { top: 0, right: 12, bottom: 0, left: 0 },
    },
    tooltip: {
      theme: 'light',
      shared: true,
      intersect: false,
      y: {
        formatter: (v: number) =>
          `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      },
    },
    annotations: activeIdx >= 0
      ? {
          xaxis: [{
            x: categories[activeIdx],
            borderColor: '#FF4D8D',
            strokeDashArray: 4,
            label: {
              borderColor: '#FF4D8D',
              style: { color: '#fff', background: '#FF4D8D', fontSize: '10px', fontWeight: 600 },
              text: 'Selected',
              orientation: 'horizontal',
              position: 'top',
            },
          }],
        }
      : undefined,
  };

  const series = [
    { name: 'Commission', data: data.map((p) => Math.round(p.commission)) },
    { name: 'Retainers', data: data.map((p) => Math.round(p.retainers)) },
    { name: 'Launch Fees', data: data.map((p) => Math.round(p.launchFees)) },
  ];

  return <ApexChart type="area" series={series} options={options} height={height} width="100%" />;
}
