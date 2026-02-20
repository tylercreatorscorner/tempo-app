import { createAdminClient as createClient } from '@/lib/supabase/server';
import type { BrandSummary, CreatorRanking, ProductSummary, VideoSummaryItem, DailyTrend } from '@/types';

/** Typed error for RPC calls */
export class RPCError extends Error {
  constructor(
    public readonly rpcName: string,
    public readonly details: string
  ) {
    super(`RPC ${rpcName} failed: ${details}`);
    this.name = 'RPCError';
  }
}

/** Get brand summary with GMV, orders, creators, videos */
export async function getBrandSummary(
  brand: string,
  startDate: string,
  endDate: string
): Promise<BrandSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_brand_summary', {
    p_brand: brand,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) throw new RPCError('get_brand_summary', error.message);
  return (data ?? []) as BrandSummary[];
}

/** Get creator rankings by GMV */
export async function getCreatorRankings(
  brand: string,
  startDate: string,
  endDate: string,
  limit = 20
): Promise<CreatorRanking[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_creator_rankings', {
    p_brand: brand,
    p_start_date: startDate,
    p_end_date: endDate,
    p_limit: limit,
    p_managed_only: false,
  });
  if (error) throw new RPCError('get_creator_rankings', error.message);
  return (data ?? []) as CreatorRanking[];
}

/** Get product summary */
export async function getProductSummary(
  brand: string,
  startDate: string,
  endDate: string,
  limit = 20
): Promise<ProductSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_product_summary', {
    p_brand: brand,
    p_start_date: startDate,
    p_end_date: endDate,
    p_limit: limit,
  });
  if (error) throw new RPCError('get_product_summary', error.message);
  return (data ?? []) as ProductSummary[];
}

/** Get video summary */
export async function getVideoSummary(
  brand: string,
  startDate: string,
  endDate: string,
  limit = 20
): Promise<VideoSummaryItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_video_summary', {
    p_brand: brand,
    p_start_date: startDate,
    p_end_date: endDate,
    p_limit: limit,
  });
  if (error) throw new RPCError('get_video_summary', error.message);
  return (data ?? []) as VideoSummaryItem[];
}

/** Get daily GMV/orders trend */
export async function getDailyTrend(
  brand: string,
  startDate: string,
  endDate: string
): Promise<DailyTrend[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_daily_trend', {
    p_brand: brand,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) throw new RPCError('get_daily_trend', error.message);
  return (data ?? []) as DailyTrend[];
}
