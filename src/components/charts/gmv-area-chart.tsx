'use client';

import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface Props {
  data: { date: string; gmv: number }[];
  color?: string;
  height?: number;
}

function fmtY(val: number) {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(0)}k`;
  return `$${val.toFixed(0)}`;
}

function fmtLabel(dateStr: string) {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

export function GmvAreaChart({ data, color = 'var(--primary)', height = 260 }: Props) {
  if (!data || data.length <= 1) return null;

  const categories = data.map(d => fmtLabel(d.date));
  const values = data.map(d => parseFloat(d.gmv.toFixed(2)));

  const options: ApexOptions = {
    chart: {
      type: 'area',
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: {
        enabled: true,
        speed: 900,
        animateGradually: { enabled: true, delay: 120 },
        dynamicAnimation: { enabled: true, speed: 350 },
      },
      fontFamily: 'inherit',
      background: 'transparent',
      sparkline: { enabled: false },
    },
    stroke: { curve: 'smooth', width: 2.5, colors: [color] },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        type: 'vertical',
        colorStops: [
          { offset: 0, color, opacity: 0.28 },
          { offset: 85, color, opacity: 0.02 },
        ],
      },
    },
    dataLabels: { enabled: false },
    markers: {
      size: 0,
      colors: [color],
      strokeColors: '#fff',
      strokeWidth: 2,
      hover: { size: 5, sizeOffset: 1 },
    },
    xaxis: {
      type: 'category',
      categories,
      labels: {
        style: { colors: 'var(--muted-foreground)', fontSize: '11px', fontFamily: 'inherit' },
        rotate: 0,
        hideOverlappingLabels: true,
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
      crosshairs: { show: true, stroke: { color: 'var(--border)', width: 1, dashArray: 4 } },
      tooltip: { enabled: false },
    },
    yaxis: {
      labels: {
        style: { colors: 'var(--muted-foreground)', fontSize: '11px', fontFamily: 'inherit' },
        formatter: fmtY,
      },
      forceNiceScale: true,
    },
    grid: {
      borderColor: 'var(--muted)',
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { top: 0, right: 8, bottom: 0, left: 0 },
    },
    tooltip: {
      theme: 'light',
      style: { fontSize: '12px', fontFamily: 'inherit' },
      y: {
        formatter: val =>
          `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        title: { formatter: () => 'GMV' },
      },
      marker: { show: true },
    },
  };

  return (
    <ApexChart
      type="area"
      series={[{ name: 'GMV', data: values }]}
      options={options}
      height={height}
      width="100%"
    />
  );
}
