import { createClient } from '@/lib/supabase/server';
import { brandSlugToUuid, brandUuidToSlug } from '@/lib/utils/constants';

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
  total_videos: number;
}

/** Get aggregated stats for a creator in a date range */
export async function getCreatorStats(
  creatorName: string,
  brand: string,
  startDate: string,
  endDate: string
): Promise<CreatorStats> {
  const supabase = await createClient();
  const brandUuid = brandSlugToUuid(brand);

  // Get daily_creator_stats aggregated
  let perfQuery = supabase
    .from('daily_creator_stats')
    .select('report_date, gmv, orders, items_sold, est_commission')
    .eq('tiktok_username', creatorName)
    .gte('report_date', startDate)
    .lte('report_date', endDate)
    .order('report_date', { ascending: true });
  if (brandUuid) perfQuery = perfQuery.eq('brand_id', brandUuid);

  const { data: perfData } = await perfQuery;

  const rows = perfData ?? [];
  const totalGmv = rows.reduce((s, r) => s + (r.gmv || 0), 0);
  const totalOrders = rows.reduce((s, r) => s + (r.orders || 0), 0);
  const totalItemsSold = rows.reduce((s, r) => s + (r.items_sold || 0), 0);
  const totalCommission = rows.reduce((s, r) => s + (r.est_commission || 0), 0);

  // Distinct video count from daily_video_product_stats
  let vidQuery = supabase
    .from('daily_video_product_stats')
    .select('video_id')
    .eq('tiktok_username', creatorName)
    .gte('report_date', startDate)
    .lte('report_date', endDate);
  if (brandUuid) vidQuery = vidQuery.eq('brand_id', brandUuid);

  const { data: videoIds } = await vidQuery;
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
  const supabase = await createClient();
  const brandUuid = brandSlugToUuid(brand);

  let query = supabase
    .from('daily_creator_stats')
    .select('report_date, gmv, orders, items_sold, est_commission')
    .eq('tiktok_username', creatorName)
    .gte('report_date', startDate)
    .lte('report_date', endDate)
    .order('report_date', { ascending: true });
  if (brandUuid) query = query.eq('brand_id', brandUuid);

  const { data } = await query;
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
  const { getVideoSummary } = await import('./rpc');
  try {
    const videos = await getVideoSummary(brand, startDate, endDate, 100);
    return videos
      .filter(v => v.creator_name === creatorName)
      .slice(0, limit)
      .map(v => ({
        video_id: v.video_id,
        video_title: v.video_title,
        total_gmv: v.total_gmv,
        total_orders: v.total_orders,
        total_items_sold: v.total_items_sold,
        days_active: v.days_active,
      }));
  } catch { return []; }
}

/** Get all top videos for a brand (discover) */
export async function getBrandTopVideos(
  brand: string,
  startDate: string,
  endDate: string,
  limit = 20
): Promise<(CreatorVideo & { creator_name: string })[]> {
  const { getVideoSummary } = await import('./rpc');
  try {
    const videos = await getVideoSummary(brand, startDate, endDate, limit);
    return videos.map(v => ({
      video_id: v.video_id,
      video_title: v.video_title,
      creator_name: v.creator_name,
      total_gmv: v.total_gmv,
      total_orders: v.total_orders,
      total_items_sold: v.total_items_sold,
      total_est_commission: v.total_est_commission,
      days_active: v.days_active,
    }));
  } catch { return []; }
}

/** Get creator rankings */
export async function getCreatorRankingsData(
  brand: string,
  startDate: string,
  endDate: string,
  limit = 50
): Promise<RankingEntry[]> {
  const { getCreatorRankings } = await import('./rpc');
  try {
    return await getCreatorRankings(brand, startDate, endDate, limit);
  } catch { return []; }
}

/** Get posting streak for a creator */
export async function getCreatorStreak(
  creatorName: string,
  brand: string
): Promise<number> {
  const supabase = await createClient();
  const brandUuid = brandSlugToUuid(brand);

  let query = supabase
    .from('daily_video_product_stats')
    .select('report_date')
    .eq('tiktok_username', creatorName)
    .order('report_date', { ascending: false })
    .limit(90);
  if (brandUuid) query = query.eq('brand_id', brandUuid);

  const { data } = await query;

  if (!data || data.length === 0) return 0;

  const uniqueDates = [...new Set(data.map(d => d.report_date))].sort().reverse();
  let streak = 0;
  const today = new Date();

  for (let i = 0; i < uniqueDates.length; i++) {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - i);
    const expectedStr = expected.toISOString().split('T')[0];

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
