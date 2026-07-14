'use client';

import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { useBrandMeta } from '@/hooks/use-brand-meta';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

export interface BrandBreakdownRow {
  brand: string;
  gmv: number;
  orders: number;
  videos: number;
}

interface Props {
  rows: BrandBreakdownRow[];
}

/** Donut chart on the left, ranked metric list on the right. Replaces the
 * stacked-bar visualization — donut reads share-of-mix faster, and the right
 * column keeps the per-brand secondary metrics that the bars also showed. */
export function BrandBreakdownDonut({ rows }: Props) {
  const brandMeta = useBrandMeta();
  const totalGmv = rows.reduce((s, r) => s + r.gmv, 0);
  const labels = rows.map(r => brandMeta.label(r.brand));
  const colors = rows.map(r => brandMeta.color(r.brand));
  const series = rows.map(r => Number(r.gmv.toFixed(2)));

  const options: ApexOptions = {
    chart: { type: 'donut', toolbar: { show: false } },
    labels,
    colors,
    stroke: { width: 0 },
    dataLabels: { enabled: false },
    legend: { show: false },
    tooltip: {
      y: { formatter: (val) => formatCurrency(val) },
      theme: 'light',
    },
    plotOptions: {
      pie: {
        donut: {
          size: '72%',
          labels: {
            show: true,
            name: { show: true, fontSize: '11px', color: '#8A8FB2', offsetY: -4 },
            value: {
              show: true,
              fontSize: '20px',
              fontWeight: 700,
              color: '#8A8FB2',
              formatter: (val) => formatCurrency(Number(val)),
            },
            total: {
              show: true,
              showAlways: true,
              label: 'Total GMV',
              fontSize: '11px',
              color: '#8A8FB2',
              formatter: () => formatCurrency(totalGmv),
            },
          },
        },
      },
    },
  };

  return (
    <div className="rounded-2xl bg-card border border-border shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-[#8A8FB2]">Brand Breakdown</h3>
          <p className="text-xs text-muted-foreground mt-0.5">GMV share across {rows.length} brands</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        <div className="flex justify-center min-h-[260px]">
          <ApexChart options={options} series={series} type="donut" height={260} width={260} />
        </div>

        <ul className="space-y-2.5">
          {rows.map((r) => {
            const sharePct = totalGmv > 0 ? (r.gmv / totalGmv) * 100 : 0;
            const color = brandMeta.color(r.brand);
            return (
              <li key={r.brand} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#8A8FB2] truncate">
                      {brandMeta.label(r.brand)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatNumber(r.videos)} videos · {formatNumber(r.orders)} orders
                    </p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-bold tabular-nums text-[#8A8FB2]">
                    {formatCurrency(r.gmv)}
                  </p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">{sharePct.toFixed(1)}%</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
