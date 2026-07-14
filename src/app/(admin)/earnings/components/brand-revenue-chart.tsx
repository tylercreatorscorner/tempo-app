'use client';

import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

export interface BrandRevenuePoint {
  brand: string;
  brandLabel: string;
  commission: number;
  retainer: number;
  launchFees: number;
}

interface Props {
  data: BrandRevenuePoint[];
  height?: number;
}

function fmtCurrency(v: number) {
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function fmtCompact(val: number) {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(0)}k`;
  return `$${val.toFixed(0)}`;
}

export function BrandRevenueChart({ data, height = 320 }: Props) {
  if (!data || data.length === 0) return null;

  // Sort brands by total descending so the biggest contributors are at the top
  const sorted = [...data].sort((a, b) => (b.commission + b.retainer + b.launchFees) - (a.commission + a.retainer + a.launchFees));

  const options: ApexOptions = {
    chart: {
      type: 'bar',
      stacked: true,
      stackType: 'normal',
      toolbar: { show: false },
      fontFamily: 'inherit',
      background: 'transparent',
      animations: { enabled: true, speed: 500 },
    },
    plotOptions: {
      bar: { horizontal: true, borderRadius: 6, barHeight: '60%', borderRadiusApplication: 'end', borderRadiusWhenStacked: 'last' },
    },
    colors: ['var(--primary)', 'var(--pulse-accent-2)', '#FF9800'],
    dataLabels: { enabled: false },
    stroke: { width: 0 },
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
      categories: sorted.map((d) => d.brandLabel),
      labels: { style: { colors: '#9CA3AF', fontSize: '11px' }, formatter: (v) => fmtCompact(Number(v)) },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: { style: { colors: '#1A1B3A', fontSize: '12px', fontWeight: 600 } },
    },
    grid: {
      borderColor: '#F3F4F6',
      strokeDashArray: 4,
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: false } },
    },
    tooltip: {
      theme: 'light',
      shared: true,
      intersect: false,
      y: { formatter: fmtCurrency },
    },
  };

  const series = [
    { name: 'Commission', data: sorted.map((d) => Math.round(d.commission)) },
    { name: 'Retainer', data: sorted.map((d) => Math.round(d.retainer)) },
    { name: 'Launch Fees', data: sorted.map((d) => Math.round(d.launchFees)) },
  ];

  return <ApexChart type="bar" series={series} options={options} height={height} width="100%" />;
}
