import { createAdminClient } from '@/lib/supabase/server';

/**
 * Creator-specific data fetching functions.
 * All use the admin client (server-side only).
 */

export interface CreatorStats {
  totalGmv: number;
  totalOrders: number;
  totalItemsSold: number;
  totalCommission: number;
  totalVideos: number;
  avgGmvPerVideo: number;
  conversionRate: number;
  bestDay: { date: string; gmv: number } | null;
}

export interface CreatorDailyData {
  report_date: string;
  gmv: number;
  orders: number;
  items_sold: number;
  est_commission: number;
}

export interface CreatorVideo {
  video_id: string;
  video_title: string;
  total_gmv: number;
  total_orders: number;
  total_items_sold: number;
  days_active: number;
}

export interface RankingEntry {
  creator_name: string;
  total_gmv: number;
  total_orders: number;
  total_items_sold: number;
  days_active: number;
}

/** Get aggregated stats for a creator in a date range */
export async function getCreatorStats(
  creatorName: string,
  brand: string,
  startDate: string,
  endDate: string
): Promise<CreatorStats> {
  const supabase = await createAdminClient();

  // Get creator_performance aggregated
  const { data: perfData } = await supabase
    .from('creator_performance')
    .select('report_date, gmv, orders, items_sold, est_commission')
    .eq('creator_name', creatorName)
    .eq('brand', brand)
    .gte('report_date', startDate)
    .lte('report_date', endDate)
    .order('report_date', { ascending: true });

  const rows = perfData ?? [];
  const totalGmv = rows.reduce((s, r) => s + (r.gmv || 0), 0);
  const totalOrders = rows.reduce((s, r) => s + (r.orders || 0), 0);
  const totalItemsSold = rows.reduce((s, r) => s + (r.items_sold || 0), 0);
  const totalCommission = rows.reduce((s, r) => s + (r.est_commission || 0), 0);

  // Get video count
  const { count: videoCount } = await supabase
    .from('video_performance')
    .select('video_id', { count: 'exact', head: true })
    .eq('creator_name', creatorName)
    .eq('brand', brand)
    .gte('report_date', startDate)
    .lte('report_date', endDate);

  // Distinct video count
  const { data: videoIds } = await supabase
    .from('video_performance')
    .select('video_id')
    .eq('creator_name', creatorName)
    .eq('brand', brand)
    .gte('report_date', startDate)
    .lte('report_date', endDate);

  const uniqueVideos = new Set((videoIds ?? []).map(v => v.video_id)).size;

  // Best day
  let bestDay: { date: string; gmv: number } | null = null;
  if (rows.length > 0) {
    const best = rows.reduce((a, b) => ((b.gmv || 0) > (a.gmv || 0) ? b : a));
    bestDay = { date: best.report_date, gmv: best.gmv || 0 };
  }

  return {
    totalGmv,
    totalOrders,
    totalItemsSold,
    totalCommission,
    totalVideos: uniqueVideos,
    avgGmvPerVideo: uniqueVideos > 0 ? totalGmv / uniqueVideos : 0,
    conversionRate: totalOrders > 0 && totalGmv > 0 ? (totalOrders / (totalOrders + totalGmv * 0.01)) * 100 : 0,
    bestDay,
  };
}

/** Get daily performance data for charting */
export async function getCreatorDailyData(
  creatorName: string,
  brand: string,
  startDate: string,
  endDate: string
): Promise<CreatorDailyData[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from('creator_performance')
    .select('report_date, gmv, orders, items_sold, est_commission')
    .eq('creator_name', creatorName)
    .eq('brand', brand)
    .gte('report_date', startDate)
    .lte('report_date', endDate)
    .order('report_date', { ascending: true });

  return (data ?? []) as CreatorDailyData[];
}

/** Get top videos for a creator */
export async function getCreatorTopVideos(
  creatorName: string,
  brand: string,
  startDate: string,
  endDate: string,
  limit = 10
): Promise<CreatorVideo[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.rpc('get_video_summary', {
    p_brand: brand,
    p_start_date: startDate,
    p_end_date: endDate,
    p_limit: 100,
  });

  if (error) return [];

  // Filter to this creator and take top N
  const filtered = (data ?? [])
    .filter((v: any) => v.creator_name === creatorName)
    .slice(0, limit);

  return filtered as CreatorVideo[];
}

/** Get all top videos for a brand (discover) */
export async function getBrandTopVideos(
  brand: string,
  startDate: string,
  endDate: string,
  limit = 20
): Promise<(CreatorVideo & { creator_name: string })[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.rpc('get_video_summary', {
    p_brand: brand,
    p_start_date: startDate,
    p_end_date: endDate,
    p_limit: limit,
  });

  if (error) return [];
  return (data ?? []) as (CreatorVideo & { creator_name: string })[];
}

/** Get creator rankings */
export async function getCreatorRankingsData(
  brand: string,
  startDate: string,
  endDate: string,
  limit = 50
): Promise<RankingEntry[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.rpc('get_creator_rankings', {
    p_brand: brand,
    p_start_date: startDate,
    p_end_date: endDate,
    p_limit: limit,
    p_managed_only: false,
  });

  if (error) return [];
  return (data ?? []) as RankingEntry[];
}

/** Get posting streak for a creator */
export async function getCreatorStreak(
  creatorName: string,
  brand: string
): Promise<number> {
  const supabase = await createAdminClient();
  // Get distinct dates with videos, most recent first
  const { data } = await supabase
    .from('video_performance')
    .select('report_date')
    .eq('creator_name', creatorName)
    .eq('brand', brand)
    .order('report_date', { ascending: false })
    .limit(90);

  if (!data || data.length === 0) return 0;

  const uniqueDates = [...new Set(data.map(d => d.report_date))].sort().reverse();
  let streak = 0;
  const today = new Date();

  for (let i = 0; i < uniqueDates.length; i++) {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - i);
    const expectedStr = expected.toISOString().split('T')[0];

    // Allow 1-day gap
    if (uniqueDates[i] === expectedStr || (i === 0 && uniqueDates[0] <= expectedStr)) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/** Helper: get date range strings */
export function getDateRange(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

export function getAllTimeRange(): { start: string; end: string } {
  return { start: '2020-01-01', end: new Date().toISOString().split('T')[0] };
}
