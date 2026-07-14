'use client';

import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';
import { useBrandMeta } from '@/hooks/use-brand-meta';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface TrendDataPoint {
  date: string;
  [brand: string]: number | string;
}

interface Props {
  data: TrendDataPoint[];
  brands: string[];
}

function fmtLabel(dateStr: string) {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

function fmtY(val: number) {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(0)}k`;
  return `$${val.toFixed(0)}`;
}

export function GmvTrendChart({ data, brands }: Props) {
  const brandMeta = useBrandMeta();
  if (!data || data.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">
        No trend data available for selected period
      </div>
    );
  }

  const categories = data.map(d => fmtLabel(d.date));

  const series = brands.map(brand => ({
    name: brandMeta.label(brand),
    data: data.map(d => parseFloat(Number(d[brand] ?? 0).toFixed(2))),
  }));

  const options: ApexOptions = {
    chart: {
      type: 'line',
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true, speed: 800 },
      fontFamily: 'inherit',
      background: 'transparent',
    },
    stroke: { curve: 'smooth', width: 2.5 },
    colors: brands.map(b => brandMeta.color(b)),
    dataLabels: { enabled: false },
    markers: { size: 0, hover: { size: 5 } },
    xaxis: {
      type: 'category',
      categories,
      labels: {
        style: { colors: '#8A8FB2', fontSize: '11px', fontFamily: 'var(--font-geist-mono)' },
        rotate: 0,
        hideOverlappingLabels: true,
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
      crosshairs: { show: true, stroke: { color: '#8A8FB2', width: 1, dashArray: 4 } },
      tooltip: { enabled: false },
    },
    yaxis: {
      labels: {
        style: { colors: '#8A8FB2', fontSize: '11px', fontFamily: 'var(--font-geist-mono)' },
        formatter: fmtY,
      },
      forceNiceScale: true,
    },
    grid: {
      borderColor: 'var(--muted)',
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    legend: {
      position: 'top',
      horizontalAlign: 'left',
      fontSize: '12px',
      fontFamily: 'inherit',
      markers: { size: 8 },
      itemMargin: { horizontal: 12 },
      labels: { colors: '#8A8FB2' },
    },
    tooltip: {
      shared: true,
      intersect: false,
      theme: 'light',
      style: { fontSize: '12px', fontFamily: 'var(--font-geist-mono)' },
      y: {
        formatter: val =>
          `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      },
    },
  };

  return (
    <ApexChart type="line" series={series} options={options} height={340} width="100%" />
  );
}
