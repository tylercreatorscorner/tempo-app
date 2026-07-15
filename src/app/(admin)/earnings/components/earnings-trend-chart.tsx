'use client';

import { AreaLineChart } from '@/components/charts/area-line-chart';
import { fmtCompactCurrency } from '@/components/charts/format';

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

function fmtMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

export function EarningsTrendChart({ data, height = 280 }: Props) {
  if (!data || data.length === 0) return null;

  const labels = data.map((p) => fmtMonth(p.month));

  const series = [
    { name: 'Commission', data: data.map((p) => Math.round(p.commission)) },
    { name: 'Retainers', data: data.map((p) => Math.round(p.retainers)) },
    { name: 'Launch Fees', data: data.map((p) => Math.round(p.launchFees)) },
  ];

  return <AreaLineChart labels={labels} series={series} stacked height={height} format={fmtCompactCurrency} />;
}
