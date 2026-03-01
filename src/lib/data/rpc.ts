import { createAdminClient } from '@/lib/supabase/server';
import {
  ACTIVE_BRANDS,
  BRAND_UUID_MAP,
  brandSlugToUuid,
  brandUuidToSlug,
} from '@/lib/utils/constants';
import type {
  BrandSummary,
  CreatorRanking,
  ProductSummary,
  VideoSummaryItem,
  DailyTrend,
} from '@/types';

/** Typed error for RPC calls */
export class RPCError extends Error {
  constructor(
    public readonly rpcName: string,
    public readonly details: string,
  ) {
    super(`RPC ${rpcName} failed: ${details}`);
    this.name = 'RPCError';
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Resolve brand slug → UUID(s). Returns array of UUIDs to filter on. */
function resolveBrandUuids(brand: string): string[] {
  if (brand === 'all') {
    return [...ACTIVE_BRANDS].map((b) => BRAND_UUID_MAP[b]).filter(Boolean);
  }
  const uuid = brandSlugToUuid(brand);
  if (!uuid) throw new RPCError('resolveBrand', `Unknown brand slug: ${brand}`);
  return [uuid];
}

/** Paginated fetch — bypasses PostgREST default row limit */
async function paginatedFetch(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  table: string,
  select: string,
  filters: { column: string; op: string; value: unknown }[],
  pageSize = 1000,
): Promise<any[]> {
  const all: any[] = [];
  let from = 0;
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + pageSize - 1);
    for (const f of filters) {
      if (f.op === 'gte') q = q.gte(f.column, f.value as string);
      else if (f.op === 'lte') q = q.lte(f.column, f.value as string);
      else if (f.op === 'in') q = q.in(f.column, f.value as string[]);
      else if (f.op === 'eq') q = q.eq(f.column, f.value as string);
    }
    const { data, error } = await q;
    if (error) throw new RPCError(table, error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

/** Standard date + brand filters */
function stdFilters(brandUuids: string[], startDate: string, endDate: string) {
  return [
    { column: 'report_date', op: 'gte', value: startDate },
    { column: 'report_date', op: 'lte', value: endDate },
    { column: 'brand_id', op: 'in', value: brandUuids },
  ];
}

/* ------------------------------------------------------------------ */
/*  getBrandSummary                                                    */
/* ------------------------------------------------------------------ */

export async function getBrandSummary(
  brand: string,
  startDate: string,
  endDate: string,
): Promise<BrandSummary[]> {
  const supabase = await createAdminClient();
  const uuids = resolveBrandUuids(brand);

  const rows = await paginatedFetch(
    supabase,
    'daily_creator_stats',
    'brand_id,report_date,tiktok_username,gmv,orders,items_sold,refunds,videos,livestreams,est_commission,aov',
    stdFilters(uuids, startDate, endDate),
  );

  // Aggregate per brand_id
  const map = new Map<
    string,
    {
      gmv: number;
      orders: number;
      items: number;
      refunds: number;
      videos: number;
      livestreams: number;
      commission: number;
      creators: Set<string>;
      dates: Set<string>;
      aovSum: number;
      aovCount: number;
    }
  >();

  for (const r of rows) {
    const bid = r.brand_id as string;
    let agg = map.get(bid);
    if (!agg) {
      agg = {
        gmv: 0, orders: 0, items: 0, refunds: 0, videos: 0,
        livestreams: 0, commission: 0, creators: new Set(), dates: new Set(),
        aovSum: 0, aovCount: 0,
      };
      map.set(bid, agg);
    }
    agg.gmv += Number(r.gmv) || 0;
    agg.orders += Number(r.orders) || 0;
    agg.items += Number(r.items_sold) || 0;
    agg.refunds += Number(r.refunds) || 0;
    agg.videos += Number(r.videos) || 0;
    agg.livestreams += Number(r.livestreams) || 0;
    agg.commission += Number(r.est_commission) || 0;
    if (r.tiktok_username) agg.creators.add(r.tiktok_username);
    if (r.report_date) agg.dates.add(r.report_date);
    if (r.aov != null && Number(r.aov) > 0) {
      agg.aovSum += Number(r.aov);
      agg.aovCount += 1;
    }
  }

  const results: BrandSummary[] = [];
  for (const [, agg] of map) {
    results.push({
      total_gmv: agg.gmv,
      total_orders: agg.orders,
      total_items_sold: agg.items,
      total_refunds: agg.refunds,
      total_videos: agg.videos,
      total_live_streams: agg.livestreams,
      total_est_commission: agg.commission,
      unique_creators: agg.creators.size,
      avg_aov: agg.aovCount > 0 ? agg.aovSum / agg.aovCount : 0,
    });
  }

  // If brand != 'all' but no data, return single zero-row
  if (results.length === 0) {
    results.push({
      total_gmv: 0, total_orders: 0, total_items_sold: 0, total_refunds: 0,
      total_videos: 0, total_live_streams: 0, total_est_commission: 0,
      unique_creators: 0, avg_aov: 0,
    });
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  getCreatorRankings                                                 */
/* ------------------------------------------------------------------ */

export async function getCreatorRankings(
  brand: string,
  startDate: string,
  endDate: string,
  limit = 20,
): Promise<CreatorRanking[]> {
  const supabase = await createAdminClient();
  const uuids = resolveBrandUuids(brand);

  const rows = await paginatedFetch(
    supabase,
    'daily_creator_stats',
    'tiktok_username,report_date,gmv,orders,items_sold,videos',
    stdFilters(uuids, startDate, endDate),
  );

  const map = new Map<string, { gmv: number; orders: number; items: number; dates: Set<string>; videos: number }>();
  for (const r of rows) {
    const name = r.tiktok_username as string;
    let agg = map.get(name);
    if (!agg) {
      agg = { gmv: 0, orders: 0, items: 0, dates: new Set(), videos: 0 };
      map.set(name, agg);
    }
    agg.gmv += Number(r.gmv) || 0;
    agg.orders += Number(r.orders) || 0;
    agg.items += Number(r.items_sold) || 0;
    agg.videos += Number(r.videos) || 0;
    if (r.report_date) agg.dates.add(r.report_date);
  }

  const results: CreatorRanking[] = [];
  for (const [name, agg] of map) {
    results.push({
      creator_name: name,
      total_gmv: agg.gmv,
      total_orders: agg.orders,
      total_items_sold: agg.items,
      days_active: agg.dates.size,
      total_videos: agg.videos,
    });
  }

  results.sort((a, b) => b.total_gmv - a.total_gmv);
  return results.slice(0, limit);
}

/* ------------------------------------------------------------------ */
/*  getProductSummary                                                  */
/* ------------------------------------------------------------------ */

export async function getProductSummary(
  brand: string,
  startDate: string,
  endDate: string,
  limit = 20,
): Promise<ProductSummary[]> {
  const supabase = await createAdminClient();
  const uuids = resolveBrandUuids(brand);

  const rows = await paginatedFetch(
    supabase,
    'daily_product_stats',
    'product_name,gmv,orders,items_sold',
    stdFilters(uuids, startDate, endDate),
  );

  const map = new Map<string, { gmv: number; orders: number; items: number }>();
  for (const r of rows) {
    const name = r.product_name as string;
    let agg = map.get(name);
    if (!agg) {
      agg = { gmv: 0, orders: 0, items: 0 };
      map.set(name, agg);
    }
    agg.gmv += Number(r.gmv) || 0;
    agg.orders += Number(r.orders) || 0;
    agg.items += Number(r.items_sold) || 0;
  }

  const results: ProductSummary[] = [];
  for (const [name, agg] of map) {
    results.push({
      product_name: name,
      total_gmv: agg.gmv,
      total_orders: agg.orders,
      total_items_sold: agg.items,
    });
  }

  results.sort((a, b) => b.total_gmv - a.total_gmv);
  return results.slice(0, limit);
}

/* ------------------------------------------------------------------ */
/*  getVideoSummary                                                    */
/* ------------------------------------------------------------------ */

export async function getVideoSummary(
  brand: string,
  startDate: string,
  endDate: string,
  limit = 20,
): Promise<VideoSummaryItem[]> {
  const supabase = await createAdminClient();
  const uuids = resolveBrandUuids(brand);

  const rows = await paginatedFetch(
    supabase,
    'daily_video_product_stats',
    'video_id,video_title,tiktok_username,video_url,report_date,gmv,orders,items_sold,est_commission',
    stdFilters(uuids, startDate, endDate),
  );

  const map = new Map<
    string,
    { title: string; creator: string; gmv: number; orders: number; items: number; commission: number; dates: Set<string> }
  >();
  for (const r of rows) {
    const vid = r.video_id as string;
    let agg = map.get(vid);
    if (!agg) {
      agg = {
        title: r.video_title ?? '',
        creator: r.tiktok_username ?? '',
        gmv: 0, orders: 0, items: 0, commission: 0, dates: new Set(),
      };
      map.set(vid, agg);
    }
    agg.gmv += Number(r.gmv) || 0;
    agg.orders += Number(r.orders) || 0;
    agg.items += Number(r.items_sold) || 0;
    agg.commission += Number(r.est_commission) || 0;
    if (r.report_date) agg.dates.add(r.report_date);
  }

  const results: VideoSummaryItem[] = [];
  for (const [vid, agg] of map) {
    results.push({
      video_id: vid,
      video_title: agg.title,
      creator_name: agg.creator,
      total_gmv: agg.gmv,
      total_orders: agg.orders,
      total_items_sold: agg.items,
      total_est_commission: agg.commission,
      days_active: agg.dates.size,
    });
  }

  results.sort((a, b) => b.total_gmv - a.total_gmv);
  return results.slice(0, limit);
}

/* ------------------------------------------------------------------ */
/*  getDailyTrend                                                      */
/* ------------------------------------------------------------------ */

export async function getDailyTrend(
  brand: string,
  startDate: string,
  endDate: string,
): Promise<DailyTrend[]> {
  const supabase = await createAdminClient();
  const uuids = resolveBrandUuids(brand);

  const rows = await paginatedFetch(
    supabase,
    'daily_creator_stats',
    'report_date,gmv,orders,items_sold',
    stdFilters(uuids, startDate, endDate),
  );

  const map = new Map<string, { gmv: number; orders: number; items: number }>();
  for (const r of rows) {
    const date = r.report_date as string;
    let agg = map.get(date);
    if (!agg) {
      agg = { gmv: 0, orders: 0, items: 0 };
      map.set(date, agg);
    }
    agg.gmv += Number(r.gmv) || 0;
    agg.orders += Number(r.orders) || 0;
    agg.items += Number(r.items_sold) || 0;
  }

  const results: DailyTrend[] = [];
  for (const [date, agg] of map) {
    results.push({
      report_date: date,
      daily_gmv: agg.gmv,
      daily_orders: agg.orders,
      daily_items_sold: agg.items,
    });
  }

  results.sort((a, b) => a.report_date.localeCompare(b.report_date));
  return results;
}
