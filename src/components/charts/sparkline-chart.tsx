'use client';

import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface Props {
  data: number[];
  color?: string;
  height?: number;
}

export function SparklineChart({ data, color = 'var(--primary)', height = 48 }: Props) {
  if (!data || data.length <= 1) return null;

  const options: ApexOptions = {
    chart: {
      type: 'area',
      sparkline: { enabled: true },
      animations: { enabled: false },
      fontFamily: 'inherit',
      background: 'transparent',
    },
    stroke: { curve: 'smooth', width: 1.5, colors: [color] },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        type: 'vertical',
        colorStops: [
          { offset: 0, color, opacity: 0.35 },
          { offset: 100, color, opacity: 0 },
        ],
      },
    },
    tooltip: { enabled: false },
    markers: { size: 0 },
  };

  return (
    <ApexChart
      type="area"
      series={[{ data }]}
      options={options}
      height={height}
      width="100%"
    />
  );
}
