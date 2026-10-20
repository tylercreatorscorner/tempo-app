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
import { ChevronRight } from 'lucide-react';
import { BrandsActions } from './brands-actions';
import styles from './brands.module.css';

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
    <div className={styles.page}>
      <PageHeader eyebrow="Portfolio" title="Brands" subtitle={`${brands.length} brands in your portfolio.`} actions={<div className="flex flex-wrap items-center gap-2"><BrandsActions /><Suspense fallback={null}><DateRangePicker staleThrough={staleThrough} /></Suspense></div>} />

      {/* Portfolio totals */}
      <dl className={styles.metrics}>
        {[
          { label: 'Total GMV', value: formatCurrency(portfolioTotals.gmv) },
          { label: 'Total orders', value: formatNumber(portfolioTotals.orders) },
          { label: 'Active creators', value: formatNumber(portfolioTotals.creators) },
          { label: 'Items sold', value: formatNumber(portfolioTotals.items) },
        ].map((stat) => (
          <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>
        ))}
      </dl>
      <div className={styles.context}><strong>{startDate} – {endDate}</strong><span>Recorded portfolio totals</span>{summaries.some(row=>!row.data) && <span>{summaries.filter(row=>!row.data).length} brand summaries unavailable; totals reflect available records.</span>}</div>

      {/* Empty state */}
      {brands.length === 0 && (
        <div className={styles.panel}>
          <div className={styles.empty}>
            <InterfaceIcon name="brand" className="size-7 text-primary" />
            <h2>No brands yet</h2>
            <p>
              Add your first brand to start tracking creator performance, GMV, and product analytics.
            </p>
          </div>
        </div>
      )}

      {/* Every brand can be compared in one compact portfolio list. */}
      {brands.length > 0 && <section className={styles.panel} aria-label="Brand portfolio performance">
      <header className={styles.panelHeader}><h2>Portfolio performance</h2><p>{brands.length} brands · select a brand for details</p></header>
      <div className={styles.tableScroll} role="region" aria-label="Brand performance list" tabIndex={0}>
      <div className={`${styles.columns} ${styles.tableHead}`} aria-hidden="true"><span>Brand</span><span>GMV</span><span>Portfolio share</span><span>Orders</span><span>Creators</span><span>Items</span><span /></div>
        {summaries.map(({ brand: slug, data }) => {
          const brandInfo = brands.find(b => b.slug === slug);
          const displayName = brandInfo?.name ?? slug;
          const color = brandInfo?.color ?? 'var(--primary)';
          const gmv = data?.total_gmv ?? 0;
          const gmvShare = portfolioTotals.gmv > 0 ? (gmv / portfolioTotals.gmv) * 100 : 0;

          return (
            <Link
              key={slug}
              href={`/brands/${slug}?${new URLSearchParams({range:'custom',start:startDate,end:endDate})}`}
              className={`${styles.columns} ${styles.brandRow}`}
            >
              <span className={styles.brandName}><BrandIdentity brand={slug} label={displayName} /></span>
              <span className={styles.amount}><span className="sr-only">GMV </span>{data ? formatCurrency(gmv) : '—'}</span>
              <span className={styles.share}><span className={styles.shareTrack} aria-hidden="true"><span style={{width:`${Math.min(gmvShare,100)}%`,backgroundColor:color}} /></span><span>{data ? `${gmvShare.toFixed(1)}%` : 'Unavailable'}</span></span>
              <span><span className="sr-only">Orders </span>{data ? formatNumber(data.total_orders ?? 0) : '—'}</span>
              <span><span className="sr-only">Active creators </span>{data ? formatNumber(data.unique_creators ?? 0) : '—'}</span>
              <span><span className="sr-only">Items sold </span>{data ? formatNumber(data.total_items_sold ?? 0) : '—'}</span>
              <ChevronRight size={15} className="text-muted-foreground" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
      </section>}
    </div>
  );
}
