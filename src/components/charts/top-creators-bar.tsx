'use client';

import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface Creator {
  display_name: string;
  total_gmv: number;
  isManaged: boolean;
}

interface Props {
  creators: Creator[];
  color?: string;
  limit?: number;
}

function truncate(s: string, n = 20) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function fmtVal(val: number) {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`;
  return `$${val.toFixed(0)}`;
}

export function TopCreatorsBar({ creators, color = 'var(--primary)', limit = 10 }: Props) {
  const top = creators.slice(0, limit);

  if (top.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        No creator data available
      </div>
    );
  }

  const categories = top.map(c => truncate(c.display_name));
  const values = top.map(c => parseFloat(c.total_gmv.toFixed(2)));
  const colors = top.map(c => (c.isManaged ? color : '#D1D5DB'));

  const options: ApexOptions = {
    chart: {
      type: 'bar',
      toolbar: { show: false },
      animations: {
        enabled: true,
        speed: 600,
        animateGradually: { enabled: true, delay: 80 },
      },
      fontFamily: 'inherit',
      background: 'transparent',
    },
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 5,
        borderRadiusApplication: 'end',
        distributed: true,
        barHeight: '62%',
        dataLabels: { position: 'top' },
      },
    },
    colors,
    dataLabels: {
      enabled: true,
      formatter: val => fmtVal(Number(val)),
      style: { fontSize: '10px', fontFamily: 'inherit', colors: ['#6B7280'] },
      offsetX: 6,
    },
    xaxis: {
      categories,
      labels: {
        formatter: val => fmtVal(Number(val)),
        style: { colors: '#9CA3AF', fontSize: '11px', fontFamily: 'inherit' },
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: { colors: '#374151', fontSize: '11px', fontFamily: 'inherit' },
        maxWidth: 140,
      },
    },
    grid: {
      borderColor: '#F3F4F6',
      strokeDashArray: 4,
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: false } },
      padding: { left: 0, right: 20 },
    },
    legend: { show: false },
    tooltip: {
      style: { fontSize: '12px', fontFamily: 'inherit' },
      y: {
        formatter: val =>
          `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        title: { formatter: () => 'GMV' },
      },
    },
  };

  const chartHeight = Math.max(240, top.length * 38 + 60);

  return (
    <ApexChart
      type="bar"
      series={[{ name: 'GMV', data: values }]}
      options={options}
      height={chartHeight}
      width="100%"
    />
  );
}
