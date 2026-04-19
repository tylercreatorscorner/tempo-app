'use client';

import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface Props {
  currentGmv: number;
  previousGmv: number;
  currentLabel: string;
  previousLabel: string;
  color?: string;
  height?: number;
}

function fmtVal(val: number) {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`;
  return `$${val.toFixed(0)}`;
}

export function DayComparisonChart({
  currentGmv,
  previousGmv,
  currentLabel,
  previousLabel,
  color = '#FF4D8D',
  height = 180,
}: Props) {
  const options: ApexOptions = {
    chart: {
      type: 'bar',
      toolbar: { show: false },
      animations: { enabled: true, speed: 600 },
      fontFamily: 'inherit',
      background: 'transparent',
    },
    plotOptions: {
      bar: {
        borderRadius: 8,
        borderRadiusApplication: 'end',
        columnWidth: '48%',
        distributed: true,
        dataLabels: { position: 'top' },
      },
    },
    colors: [color, '#E2E8F0'],
    dataLabels: {
      enabled: true,
      formatter: val => fmtVal(Number(val)),
      style: { fontSize: '11px', fontFamily: 'inherit', colors: ['#374151'] },
      offsetY: -6,
    },
    xaxis: {
      categories: [currentLabel, previousLabel],
      labels: { style: { colors: '#6B7280', fontSize: '12px', fontFamily: 'inherit' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        formatter: val => fmtVal(val),
        style: { colors: '#9CA3AF', fontSize: '10px', fontFamily: 'inherit' },
      },
      forceNiceScale: true,
    },
    grid: {
      borderColor: '#F3F4F6',
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
    },
    legend: { show: false },
    tooltip: {
      theme: 'light',
      style: { fontSize: '12px', fontFamily: 'inherit' },
      y: {
        formatter: val =>
          `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        title: { formatter: () => 'GMV' },
      },
    },
  };

  return (
    <ApexChart
      type="bar"
      series={[{ name: 'GMV', data: [currentGmv, previousGmv] }]}
      options={options}
      height={height}
      width="100%"
    />
  );
}
