'use client';

import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';
import type { DailyTrend } from '@/types';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface Props {
  data: DailyTrend[];
  color?: string;
  className?: string;
}

function fmtY(val: number) {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(0)}k`;
  return `$${val.toFixed(0)}`;
}

export function TrendChart({ data, color = '#FF4D8D', className }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className={`flex items-center justify-center h-64 text-gray-400 text-sm ${className ?? ''}`}>
        No trend data available
      </div>
    );
  }

  const categories = data.map(d => {
    const [, m, day] = d.report_date.split('-');
    return `${parseInt(m)}/${parseInt(day)}`;
  });

  const options: ApexOptions = {
    chart: {
      type: 'area',
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true, speed: 800 },
      fontFamily: 'inherit',
      background: 'transparent',
    },
    stroke: { curve: 'smooth', width: 2.5, colors: [color] },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        type: 'vertical',
        colorStops: [
          { offset: 0, color, opacity: 0.25 },
          { offset: 90, color, opacity: 0.02 },
        ],
      },
    },
    dataLabels: { enabled: false },
    markers: { size: 0, hover: { size: 5 } },
    xaxis: {
      type: 'category',
      categories,
      labels: {
        style: { colors: '#9CA3AF', fontSize: '11px', fontFamily: 'inherit' },
        hideOverlappingLabels: true,
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
      tooltip: { enabled: false },
    },
    yaxis: {
      labels: {
        style: { colors: '#9CA3AF', fontSize: '11px', fontFamily: 'inherit' },
        formatter: fmtY,
      },
      forceNiceScale: true,
    },
    grid: {
      borderColor: '#F3F4F6',
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
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
    <div className={className}>
      <ApexChart
        type="area"
        series={[{ name: 'GMV', data: data.map(d => parseFloat(d.daily_gmv.toFixed(2))) }]}
        options={options}
        height={300}
        width="100%"
      />
    </div>
  );
}
