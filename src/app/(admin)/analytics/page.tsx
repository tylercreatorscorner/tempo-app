export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { getCreatorRankings, getProductSummary, getVideoSummary } from '@/lib/data/rpc';
import { resolveDateRange } from '@/lib/data/date-utils';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { AnalyticsTabs } from '@/components/analytics/analytics-tabs';
import { BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import { createClient } from '@/lib/supabase/server';

interface Props {
  searchParams: Promise<{ range?: string; brand?: string }>;
}

export default async function AnalyticsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { startDate, endDate } = resolveDateRange(params.range);

  const supabase = await createClient();
  // Honor user's allowed_brands restriction (if any)
  const { getAllowedBrandsForUser } = await import('@/lib/data/brands');
  const allowedBrands = await getAllowedBrandsForUser();
  let brandsQuery = supabase.from('brands_v2').select('slug').eq('is_archived', false);
  if (allowedBrands) brandsQuery = brandsQuery.in('slug', allowedBrands);
  const { data: dbBrands } = await brandsQuery.order('name');
  const ALL_BRANDS = (dbBrands ?? []).map(b => b.slug);

  const brandFilter = params.brand && ALL_BRANDS.includes(params.brand)
    ? params.brand : null;
  const BRANDS = brandFilter ? [brandFilter] : ALL_BRANDS;

  const [allCreators, allProducts, allVideos] = await Promise.all([
    Promise.all(
      BRANDS.map(async (brand) => {
        try {
          const data = await getCreatorRankings(brand, startDate, endDate, 500);
          return data.map((c) => ({ ...c, brand }));
        } catch { return []; }
      })
    ).then((r) => r.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0))),
    Promise.all(
      BRANDS.map(async (brand) => {
        try {
          const data = await getProductSummary(brand, startDate, endDate, 100);
          return data.map((p) => ({ ...p, brand }));
        } catch { return []; }
      })
    ).then((r) => r.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0))),
    Promise.all(
      BRANDS.map(async (brand) => {
        try {
          const data = await getVideoSummary(brand, startDate, endDate, 200);
          return data.map((v) => ({ ...v, brand }));
        } catch { return []; }
      })
    ).then((r) => r.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0))),
  ]);

  const creators = allCreators.map((c) => ({
    creator_name: c.creator_name,
    total_videos: c.total_videos,
    total_gmv: c.total_gmv,
    total_orders: c.total_orders,
    total_items_sold: c.total_items_sold,
    avg_gmv_per_video: c.total_videos > 0 ? c.total_gmv / c.total_videos : 0,
    brand: c.brand,
  }));

  const products = allProducts.map((p) => ({
    product_name: p.product_name,
    total_items_sold: p.total_items_sold,
    total_gmv: p.total_gmv,
    total_orders: p.total_orders,
    brand: p.brand,
  }));

  const videos = allVideos.map((v) => ({
    video_title: v.video_title || 'Untitled',
    creator_name: v.creator_name,
    total_gmv: v.total_gmv,
    total_orders: v.total_orders,
    total_items_sold: v.total_items_sold,
    days_active: v.days_active,
    brand: v.brand,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1B3A]">
            {brandFilter ? `${BRAND_DISPLAY_NAMES[brandFilter] ?? brandFilter} Analytics` : 'Analytics'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">Performance insights across creators, products, and videos</p>
        </div>
        <Suspense fallback={null}>
          <DateRangePicker />
        </Suspense>
      </div>

      <AnalyticsTabs creators={creators} products={products} videos={videos} />
    </div>
  );
}
