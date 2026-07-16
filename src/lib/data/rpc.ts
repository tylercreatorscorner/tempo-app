import { createClient } from '@/lib/supabase/server';
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
/*  getBrandSummary                                                    */
/* ------------------------------------------------------------------ */

export async function getBrandSummary(
  brand: string,
  startDate: string,
  endDate: string,
): Promise<BrandSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_brand_summary', {
    p_brand: brand,
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (error) throw new RPCError('get_brand_summary', error.message);

  if (!data || data.length === 0) {
    return [{
      total_gmv: 0, total_orders: 0, total_items_sold: 0,
      total_videos: 0, unique_creators: 0, avg_aov: 0,
    }];
  }

  return data.map((r: Record<string, unknown>) => ({
    total_gmv: Number(r.total_gmv) || 0,
    total_orders: Number(r.total_orders) || 0,
    total_items_sold: Number(r.total_items_sold) || 0,
    total_videos: Number(r.total_videos) || 0,
    unique_creators: Number(r.unique_creators) || 0,
    avg_aov: Number(r.avg_aov) || 0,
  }));
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
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_creator_rankings', {
    p_brand: brand,
    p_start_date: startDate,
    p_end_date: endDate,
    p_limit: limit,
    p_managed_only: false,
    p_tenant_id: null,
  });

  if (error) throw new RPCError('get_creator_rankings', error.message);
  if (!data) return [];

  return data.map((r: Record<string, unknown>) => ({
    creator_name: String(r.creator_name),
    total_gmv: Number(r.total_gmv) || 0,
    total_orders: Number(r.total_orders) || 0,
    total_items_sold: Number(r.total_items_sold) || 0,
    days_active: Number(r.days_active) || 0,
    total_videos: Number(r.total_videos) || 0,
  }));
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
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_product_summary', {
    p_brand: brand,
    p_start_date: startDate,
    p_end_date: endDate,
    p_limit: limit,
  });

  if (error) throw new RPCError('get_product_summary', error.message);
  if (!data) return [];

  return data.map((r: Record<string, unknown>) => ({
    product_name: String(r.product_name),
    total_gmv: Number(r.total_gmv) || 0,
    total_orders: Number(r.total_orders) || 0,
    total_items_sold: Number(r.total_items_sold) || 0,
  }));
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
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_video_summary', {
    p_brand: brand,
    p_start_date: startDate,
    p_end_date: endDate,
    p_limit: limit,
  });

  if (error) throw new RPCError('get_video_summary', error.message);
  if (!data) return [];

  return data.map((r: Record<string, unknown>) => ({
    video_id: String(r.video_id),
    video_title: String(r.video_title ?? ''),
    creator_name: String(r.creator_name ?? ''),
    total_gmv: Number(r.total_gmv) || 0,
    total_orders: Number(r.total_orders) || 0,
    total_items_sold: Number(r.total_items_sold) || 0,
    total_est_commission: Number(r.total_est_commission) || 0,
    days_active: Number(r.days_active) || 0,
  }));
}

/* ------------------------------------------------------------------ */
/*  Multi-brand analytics RPCs (migration 036)                         */
/*  These collapse the per-brand fan-out on /analytics into single     */
/*  calls that return rows tagged with brand slug.                     */
/* ------------------------------------------------------------------ */

export interface AnalyticsBrandTotals {
  brand_id: string;
  brand_slug: string;
  total_gmv: number;
  total_orders: number;
  total_items_sold: number;
  total_videos: number;
}

/**
 * Per-brand sums (GMV / orders / items / videos) for a date range.
 *
 * Replaces the older `analytics_brand_summaries` RPC, which returned the same
 * rows plus a `unique_creators` count that no caller ever displayed. That count
 * forced a GroupAggregate over the whole window (366k rows for 7 days) and
 * spilled ~19MB to disk — ~1.55s vs ~210ms here — which under concurrent load
 * exceeded the authenticated role's statement_timeout. Callers caught the error
 * and rendered $0, so the dashboard and the roster both silently reported no GMV.
 *
 * The DB function `analytics_brand_summaries` still exists for the legacy
 * dashboard; nothing in this app should use it. If you need unique_creators,
 * write a narrower query rather than reviving it.
 */
export async function getAnalyticsBrandTotals(
  brandIds: string[],
  startDate: string,
  endDate: string,
): Promise<AnalyticsBrandTotals[]> {
  if (brandIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('analytics_brand_totals', {
    p_brand_ids: brandIds,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) throw new RPCError('analytics_brand_totals', error.message);
  if (!data) return [];
  return data.map((r: Record<string, unknown>) => ({
    brand_id: String(r.brand_id),
    brand_slug: String(r.brand_slug),
    total_gmv: Number(r.total_gmv) || 0,
    total_orders: Number(r.total_orders) || 0,
    total_items_sold: Number(r.total_items_sold) || 0,
    total_videos: Number(r.total_videos) || 0,
  }));
}

export interface AnalyticsCreatorRanking {
  brand_slug: string;
  creator_name: string;
  total_gmv: number;
  total_orders: number;
  total_items_sold: number;
  total_videos: number;
}

export async function getAnalyticsCreatorRankings(
  brandIds: string[],
  startDate: string,
  endDate: string,
  limit = 500,
): Promise<AnalyticsCreatorRanking[]> {
  if (brandIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('analytics_creator_rankings', {
    p_brand_ids: brandIds,
    p_start_date: startDate,
    p_end_date: endDate,
    p_limit: limit,
  });
  if (error) throw new RPCError('analytics_creator_rankings', error.message);
  if (!data) return [];
  return data.map((r: Record<string, unknown>) => ({
    brand_slug: String(r.brand_slug),
    creator_name: String(r.creator_name ?? ''),
    total_gmv: Number(r.total_gmv) || 0,
    total_orders: Number(r.total_orders) || 0,
    total_items_sold: Number(r.total_items_sold) || 0,
    total_videos: Number(r.total_videos) || 0,
  }));
}

export interface AnalyticsVideo {
  brand_slug: string;
  video_id: string;
  video_title: string;
  creator_name: string;
  total_gmv: number;
  total_orders: number;
  total_items_sold: number;
  days_active: number;
}

export async function getAnalyticsVideos(
  brandIds: string[],
  startDate: string,
  endDate: string,
  limit = 200,
): Promise<AnalyticsVideo[]> {
  if (brandIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('analytics_videos', {
    p_brand_ids: brandIds,
    p_start_date: startDate,
    p_end_date: endDate,
    p_limit: limit,
  });
  if (error) throw new RPCError('analytics_videos', error.message);
  if (!data) return [];
  return data.map((r: Record<string, unknown>) => ({
    brand_slug: String(r.brand_slug),
    video_id: String(r.video_id),
    video_title: String(r.video_title ?? ''),
    creator_name: String(r.creator_name ?? ''),
    total_gmv: Number(r.total_gmv) || 0,
    total_orders: Number(r.total_orders) || 0,
    total_items_sold: Number(r.total_items_sold) || 0,
    days_active: Number(r.days_active) || 0,
  }));
}

export interface AnalyticsProduct {
  brand_slug: string;
  product_name: string;
  total_gmv: number;
  total_orders: number;
  total_items_sold: number;
}

export async function getAnalyticsProducts(
  brandIds: string[],
  startDate: string,
  endDate: string,
  limit = 50,
): Promise<AnalyticsProduct[]> {
  if (brandIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('analytics_products', {
    p_brand_ids: brandIds,
    p_start_date: startDate,
    p_end_date: endDate,
    p_limit: limit,
  });
  if (error) throw new RPCError('analytics_products', error.message);
  if (!data) return [];
  return data.map((r: Record<string, unknown>) => ({
    brand_slug: String(r.brand_slug),
    product_name: String(r.product_name ?? ''),
    total_gmv: Number(r.total_gmv) || 0,
    total_orders: Number(r.total_orders) || 0,
    total_items_sold: Number(r.total_items_sold) || 0,
  }));
}

export async function getAnalyticsDailyTrend(
  brandIds: string[],
  startDate: string,
  endDate: string,
): Promise<DailyTrend[]> {
  if (brandIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('analytics_daily_trend', {
    p_brand_ids: brandIds,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) throw new RPCError('analytics_daily_trend', error.message);
  if (!data) return [];
  return data.map((r: Record<string, unknown>) => ({
    report_date: String(r.report_date),
    daily_gmv: Number(r.daily_gmv) || 0,
    daily_orders: Number(r.daily_orders) || 0,
    daily_items_sold: Number(r.daily_items_sold) || 0,
    daily_videos: Number(r.daily_videos) || 0,
  }));
}

/* ------------------------------------------------------------------ */
/*  getDailyTrend                                                      */
/* ------------------------------------------------------------------ */

export async function getDailyTrend(
  brand: string,
  startDate: string,
  endDate: string,
): Promise<DailyTrend[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_daily_trend', {
    p_brand: brand,
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (error) throw new RPCError('get_daily_trend', error.message);
  if (!data) return [];

  return data.map((r: Record<string, unknown>) => ({
    report_date: String(r.report_date),
    daily_gmv: Number(r.daily_gmv) || 0,
    daily_orders: Number(r.daily_orders) || 0,
    daily_items_sold: Number(r.daily_items_sold) || 0,
    daily_videos: Number(r.daily_videos) || 0,
  }));
}
