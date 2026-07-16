'use client';

import { AreaLineChart } from '@/components/charts/area-line-chart';
import { fmtCompactCurrency } from '@/components/charts/format';
import { useBrandMeta } from '@/hooks/use-brand-meta';

interface TrendDataPoint {
  date: string;
  [brand: string]: number | string;
}

interface Props {
  data: TrendDataPoint[];
  brands: string[];
}

function fmtLabel(dateStr: string) {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

export function GmvTrendChart({ data, brands }: Props) {
  const brandMeta = useBrandMeta();
  if (!data || data.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">
        No trend data available for selected period
      </div>
    );
  }

  const categories = data.map(d => fmtLabel(d.date));

  const series = brands.map(brand => ({
    name: brandMeta.label(brand),
    data: data.map(d => parseFloat(Number(d[brand] ?? 0).toFixed(2))),
    color: brandMeta.color(brand),
  }));

  return (
    <AreaLineChart
      labels={categories}
      series={series}
      area={false}
      height={340}
      showAxis
      format={fmtCompactCurrency}
    />
  );
}
