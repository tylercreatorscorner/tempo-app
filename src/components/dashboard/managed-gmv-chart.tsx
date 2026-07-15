'use client';

import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';
import { formatCurrency } from '@/lib/utils/format';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

function compact(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
}

/** Managed-GMV daily trend — the agency's headline line chart (mockup row 2). */
export function ManagedGmvChart({
  data,
  total,
  trend,
  label,
}: {
  data: { date: string; gmv: number }[];
  total: number;
  trend?: number;
  label: string;
}) {
  const isPos = trend !== undefined && trend >= 0;
  const series = [{ name: 'Managed GMV', data: data.map((d) => ({ x: d.date, y: Math.round(d.gmv) })) }];

  const options: ApexOptions = {
    chart: { type: 'area', toolbar: { show: false }, zoom: { enabled: false }, fontFamily: 'inherit', animations: { enabled: false } },
    colors: ['#5AA6FF'],
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2 },
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.32, opacityTo: 0, stops: [0, 100] } },
    grid: { borderColor: 'var(--border)', strokeDashArray: 4, xaxis: { lines: { show: false } }, padding: { left: 8, right: 8 } },
    xaxis: {
      type: 'datetime',
      labels: { style: { colors: '#8A8FB2', fontSize: '11px' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
      tooltip: { enabled: false },
    },
    yaxis: { labels: { formatter: (v: number) => compact(v), style: { colors: '#8A8FB2', fontSize: '11px' } } },
    tooltip: { y: { formatter: (v: number) => formatCurrency(v) }, x: { format: 'MMM d' } },
  };

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums text-foreground">{formatCurrency(total)}</p>
        </div>
        {trend !== undefined && (
          <Badge variant={isPos ? 'positive' : 'negative'} size="sm" className="tabular-nums">
            {isPos ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {data.length > 1 ? (
          <ApexChart options={options} series={series} type="area" height={260} />
        ) : (
          <div className="grid h-[260px] place-items-center text-sm text-muted-foreground">Not enough data for a trend</div>
        )}
      </CardContent>
    </Card>
  );
}
