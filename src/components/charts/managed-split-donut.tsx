'use client';

import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface Props {
  managedGmv: number;
  unmanagedGmv: number;
  height?: number;
}

function fmt(val: number) {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`;
  return `$${val.toFixed(0)}`;
}

export function ManagedSplitDonut({ managedGmv, unmanagedGmv, height = 260 }: Props) {
  const total = managedGmv + unmanagedGmv;
  const managedPct = total > 0 ? Math.round((managedGmv / total) * 100) : 0;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        No GMV data for this period
      </div>
    );
  }

  const options: ApexOptions = {
    chart: {
      type: 'donut',
      toolbar: { show: false },
      animations: { enabled: true, speed: 700 },
      fontFamily: 'inherit',
      background: 'transparent',
    },
    labels: ['Managed', 'Unmanaged'],
    colors: ['#A855F7', '#8A8FB2'],
    plotOptions: {
      pie: {
        donut: {
          size: '76%',
          labels: {
            show: true,
            name: {
              show: true,
              fontSize: '12px',
              color: '#8A8FB2',
              fontFamily: 'inherit',
              offsetY: -6,
            },
            value: {
              show: true,
              fontSize: '24px',
              fontWeight: '800',
              color: '#8A8FB2',
              fontFamily: 'inherit',
              formatter: val => fmt(Number(val)),
              offsetY: 6,
            },
            total: {
              show: true,
              label: 'Managed',
              color: '#8A8FB2',
              fontSize: '12px',
              fontFamily: 'inherit',
              formatter: () => `${managedPct}%`,
            },
          },
        },
      },
    },
    dataLabels: { enabled: false },
    stroke: { width: 0 },
    legend: {
      position: 'bottom',
      fontSize: '12px',
      fontFamily: 'inherit',
      offsetY: 4,
      markers: { size: 8 },
      itemMargin: { horizontal: 12 },
      labels: { colors: '#8A8FB2' },
    },
    tooltip: {
      style: { fontSize: '12px', fontFamily: 'inherit' },
      y: {
        formatter: val =>
          `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      },
    },
    states: {
      hover: { filter: { type: 'darken' } },
      active: { filter: { type: 'darken' } },
    },
  };

  return (
    <ApexChart
      type="donut"
      series={[managedGmv, unmanagedGmv]}
      options={options}
      height={height}
      width="100%"
    />
  );
}
