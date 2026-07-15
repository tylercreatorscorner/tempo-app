'use client';

import { HorizontalBars } from '@/components/charts/bar-chart';
import { fmtCompactCurrency } from '@/components/charts/format';
import { useBrandMeta } from '@/hooks/use-brand-meta';

interface Props {
  data: Record<string, number>;
  height?: number;
}

export function BrandSpendChart({ data }: Props) {
  const brandMeta = useBrandMeta();
  const entries = Object.entries(data).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">No retainer spend recorded</p>
    );
  }

  return (
    <HorizontalBars
      rows={entries.map(([brand, v]) => ({
        label: brandMeta.label(brand),
        value: v,
        color: brandMeta.color(brand),
      }))}
      format={fmtCompactCurrency}
    />
  );
}
