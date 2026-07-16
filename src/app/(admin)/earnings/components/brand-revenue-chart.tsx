'use client';

import { HorizontalBars } from '@/components/charts/bar-chart';
import { fmtCompactCurrency } from '@/components/charts/format';

export interface BrandRevenuePoint {
  brand: string;
  brandLabel: string;
  commission: number;
  retainer: number;
  launchFees: number;
}

interface Props {
  data: BrandRevenuePoint[];
  height?: number;
}

export function BrandRevenueChart({ data, height = 320 }: Props) {
  if (!data || data.length === 0) return null;

  // Sort brands by total descending so the biggest contributors are at the top
  const sorted = [...data].sort((a, b) => (b.commission + b.retainer + b.launchFees) - (a.commission + a.retainer + a.launchFees));

  // Rows = brands; each row stacks commission/retainer/launch. These segments are
  // NOT brand-identified, so we don't pass colors — the kit assigns CVD-validated
  // categorical slots + legend automatically.
  const rows = sorted.map((d) => ({
    label: d.brandLabel,
    segments: [
      { name: 'Commission', value: Math.round(d.commission) },
      { name: 'Retainer', value: Math.round(d.retainer) },
      { name: 'Launch Fees', value: Math.round(d.launchFees) },
    ],
  }));

  return (
    <div style={{ minHeight: height }}>
      <HorizontalBars rows={rows} format={fmtCompactCurrency} />
    </div>
  );
}
