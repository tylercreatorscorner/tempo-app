export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getBrandSummary } from '@/lib/data/rpc';
import { resolveDateRange } from '@/lib/data/date-utils';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { DollarSign, ShoppingCart, Users, Package } from 'lucide-react';
import { BrandsActions } from './brands-actions';

interface Props {
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}

export default async function BrandsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { startDate, endDate } = resolveDateRange(params.range, params.start, params.end);

  // Load brands from database (tenant-scoped via RLS)
  const supabase = await createClient();
  // Honor user's allowed_brands restriction (if any)
  const { getAllowedBrandsForUser } = await import('@/lib/data/brands');
  const allowedBrands = await getAllowedBrandsForUser();

  let brandsQuery = supabase
    .from('brands_v2')
    .select('id, slug, name, display_name, color')
    .eq('is_archived', false);
  if (allowedBrands) brandsQuery = brandsQuery.in('slug', allowedBrands);
  const { data: dbBrands } = await brandsQuery.order('name');

  const brands = (dbBrands ?? []).map(b => ({
    slug: b.slug,
    name: b.display_name || b.name,
    color: b.color || 'var(--muted-foreground)',
  }));

  // Fetch summaries for each brand
  const summaries = await Promise.all(
    brands.map(async (brand) => {
      try {
        const data = await getBrandSummary(brand.slug, startDate, endDate);
        return { brand: brand.slug, data: data[0] ?? null };
      } catch {
        return { brand: brand.slug, data: null };
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
            Portfolio overview — {brands.length} brand{brands.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <BrandsActions />
          <Suspense fallback={null}>
            <DateRangePicker />
          </Suspense>
        </div>
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

      {/* Empty state */}
      {brands.length === 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="text-5xl mb-4">🏢</div>
            <h3 className="text-lg font-bold">No brands yet</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm">
              Add your first brand to start tracking creator performance, GMV, and product analytics.
            </p>
          </div>
        </div>
      )}

      {/* Brand Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {summaries.map(({ brand: slug, data }) => {
          const brandInfo = brands.find(b => b.slug === slug);
          const color = brandInfo?.color ?? 'var(--muted-foreground)';
          const displayName = brandInfo?.name ?? slug;
          const gmv = data?.total_gmv ?? 0;
          const gmvShare = portfolioTotals.gmv > 0 ? (gmv / portfolioTotals.gmv) * 100 : 0;

          return (
            <Link
              key={slug}
              href={`/brands/${slug}`}
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
