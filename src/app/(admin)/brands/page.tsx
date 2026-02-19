import { Suspense } from 'react';
import Link from 'next/link';
import { getBrandSummary } from '@/lib/data/rpc';
import { resolveDateRange } from '@/lib/data/date-utils';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { BRAND_COLORS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { DollarSign, ShoppingCart, Users, Package } from 'lucide-react';

const BRANDS = ['jiyu', 'catakor', 'physicians_choice', 'toplux'] as const;

interface Props {
  searchParams: Promise<{ range?: string }>;
}

export default async function BrandsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { startDate, endDate } = resolveDateRange(params.range);

  const summaries = await Promise.all(
    BRANDS.map(async (brand) => {
      try {
        const data = await getBrandSummary(brand, startDate, endDate);
        return { brand, data: data[0] ?? null };
      } catch {
        return { brand, data: null };
      }
    })
  );

  const portfolioTotals = summaries.reduce(
    (acc, { data }) => {
      if (!data) return acc;
      acc.gmv += data.total_gmv ?? 0;
      acc.orders += data.total_orders ?? 0;
      acc.creators += data.unique_creators ?? 0;
      acc.items += data.total_items_sold ?? 0;
      return acc;
    },
    { gmv: 0, orders: 0, creators: 0, items: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Brands</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Portfolio overview — {BRANDS.length} brands
          </p>
        </div>
        <Suspense fallback={null}>
          <DateRangePicker />
        </Suspense>
      </div>

      {/* Portfolio totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total GMV', value: formatCurrency(portfolioTotals.gmv), icon: DollarSign },
          { label: 'Total Orders', value: formatNumber(portfolioTotals.orders), icon: ShoppingCart },
          { label: 'Active Creators', value: formatNumber(portfolioTotals.creators), icon: Users },
          { label: 'Items Sold', value: formatNumber(portfolioTotals.items), icon: Package },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-5 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <stat.icon className="h-4 w-4 text-primary" />
              </div>
            </div>
            <p className="text-2xl font-extrabold tracking-tight">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Brand Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {summaries.map(({ brand, data }) => {
          const color = BRAND_COLORS[brand] ?? '#6B7280';
          const displayName = BRAND_DISPLAY_NAMES[brand] ?? brand;
          const gmv = data?.total_gmv ?? 0;
          const gmvShare = portfolioTotals.gmv > 0 ? (gmv / portfolioTotals.gmv) * 100 : 0;

          return (
            <Link
              key={brand}
              href={`/brands/${brand}`}
              className="group rounded-xl border border-border bg-card p-6 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 hover:scale-[1.01] transition-all duration-200"
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                  style={{ backgroundColor: color }}
                >
                  {displayName.charAt(0)}
                </div>
                <div>
                  <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">{displayName}</h3>
                  <p className="text-xs text-muted-foreground">{gmvShare.toFixed(1)}% of portfolio</p>
                </div>
              </div>

              {/* GMV bar */}
              <div className="mb-4">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(gmvShare, 100)}%`, backgroundColor: color }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">GMV</p>
                  <p className="text-lg font-bold">{formatCurrency(gmv)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Orders</p>
                  <p className="text-lg font-bold">{formatNumber(data?.total_orders ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Active Creators</p>
                  <p className="text-lg font-bold">{formatNumber(data?.unique_creators ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Items Sold</p>
                  <p className="text-lg font-bold">{formatNumber(data?.total_items_sold ?? 0)}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
