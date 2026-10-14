export const dynamic = 'force-dynamic';

import { PageHeader } from '@/components/ui/page-header';
import { BrandIdentity } from '@/components/creators/brand-identity';
import { InterfaceIcon } from '@/components/ui/interface-icon';
import { Suspense } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getBrandSummary } from '@/lib/data/rpc';
import { resolveDateRange } from '@/lib/data/date-utils';
import { getDataAnchorDate } from '@/lib/data/data-anchor';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { DollarSign, ShoppingCart, Users, Package } from 'lucide-react';
import { BrandsActions } from './brands-actions';

interface Props {
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}

export default async function BrandsPage({ searchParams }: Props) {
  const params = await searchParams;

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

  // Rolling presets end at the last day with data, not calendar yesterday.
  // Scoped to what this page is showing, never per brand inside a total.
  // See the note on resolveDateRange.
  const dataThrough = await getDataAnchorDate(brands.map(b => b.slug));
  const { startDate, endDate, lagDays, anchorDate } =
    resolveDateRange(params.range, params.start, params.end, dataThrough);
  // Non-null only when the window actually moved; see DateRangePicker.
  const staleThrough = lagDays > 0 ? anchorDate : null;

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
    <div className="space-y-4">
      <PageHeader eyebrow="Portfolio" title="Brands" subtitle={`${brands.length} brands in your portfolio.`} actions={<div className="flex flex-wrap items-center gap-2"><BrandsActions /><Suspense fallback={null}><DateRangePicker staleThrough={staleThrough} /></Suspense></div>} />

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
            <div className="text-5xl mb-4"><InterfaceIcon name="brand" className="size-7 text-primary" /></div>
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
          const displayName = brandInfo?.name ?? slug;
          const color = brandInfo?.color ?? 'var(--primary)';
          const gmv = data?.total_gmv ?? 0;
          const gmvShare = portfolioTotals.gmv > 0 ? (gmv / portfolioTotals.gmv) * 100 : 0;

          return (
            <Link
              key={slug}
              href={`/brands/${slug}`}
              className="group rounded-xl border border-border bg-card p-4 hover:border-primary/30 hover:bg-secondary/30 transition-colors duration-150"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="min-w-0"><h3 className="font-semibold text-sm"><BrandIdentity brand={slug} label={displayName} /></h3><p className="mt-2 text-xs text-muted-foreground">{gmvShare.toFixed(1)}% of portfolio</p></div>
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
