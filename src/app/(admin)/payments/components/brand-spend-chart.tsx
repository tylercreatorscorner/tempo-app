'use client';

import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';
import { useBrandMeta } from '@/hooks/use-brand-meta';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface Props {
  data: Record<string, number>;
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
export function BrandSpendChart({ data, height = 220 }: Props) {
  const brandMeta = useBrandMeta();
  const entries = Object.entries(data).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">No retainer spend recorded</p>
    );
  }

  const options: ApexOptions = {
    chart: {
      type: 'bar',
      toolbar: { show: false },
      background: 'transparent',
      fontFamily: 'inherit',
      animations: { enabled: true, speed: 500 },
    },
    plotOptions: {
      bar: { horizontal: true, borderRadius: 5, barHeight: '60%', distributed: true, borderRadiusApplication: 'end' },
    },
    dataLabels: { enabled: false },
    legend: { show: false },
    xaxis: {
      categories: entries.map(([brand]) => brandMeta.label(brand)),
      labels: {
        formatter: (v: string) => fmtCompact(Number(v)),
        style: { colors: Array(entries.length).fill('#9CA3AF'), fontSize: '11px' },
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: { style: { colors: Array(entries.length).fill('#1A1B3A'), fontSize: '12px', fontWeight: '600' } },
    },
    colors: entries.map(([brand]) => brandMeta.color(brand)),
    grid: {
      borderColor: '#F3F4F6',
      strokeDashArray: 4,
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: false } },
    },
    tooltip: { theme: 'light', y: { formatter: fmtCurrency } },
  };

  const series = [{ name: 'Retainer', data: entries.map(([, v]) => v) }];

  return <ApexChart type="bar" series={series} options={options} height={height} width="100%" />;
}
