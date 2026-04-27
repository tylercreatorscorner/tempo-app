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

  if (error) {
    console.error(`[getVideoSummary] brand=${brand} dates=${startDate}..${endDate}`);
    console.error(`[getVideoSummary] error.message=${error.message}`);
    console.error(`[getVideoSummary] error.code=${error.code}`);
    console.error(`[getVideoSummary] error.details=${error.details}`);
    console.error(`[getVideoSummary] error.hint=${error.hint}`);
    throw new RPCError('get_video_summary', error.message);
  }
  if (!data) {
    console.warn(`[getVideoSummary] null data brand=${brand}`);
    return [];
  }
  if (data.length === 0) {
    console.warn(`[getVideoSummary] empty array brand=${brand} dates=${startDate}..${endDate}`);
  }

  return data.map((r: Record<string, unknown>) => ({
    video_id: String(r.video_id),
    video_title: String(r.video_title ?? ''),
    creator_name: String(r.creator_name ?? ''),
    total_gmv: Number(r.total_gmv) || 0,
    total_orders: Number(r.total_orders) || 0,
    total_items_sold: Number(r.total_items_sold) || 0,
    total_est_commission: Number(r.total_est_commission) || 0,
    total_views: Number(r.total_views) || 0,
    days_active: Number(r.days_active) || 0,
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
