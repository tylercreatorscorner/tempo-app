import { createAdminClient } from '@/lib/supabase/server';
import { ACTIVE_BRANDS } from '@/lib/utils/constants';
import { format, subDays } from 'date-fns';

export interface RisingVideo {
  video_id: string;
  video_title: string;
  creator_name: string;
  brand: string;
  recent_avg_gmv: number;
  prior_avg_gmv: number;
  growth_pct: number;
  video_link: string | null;
}

export interface TrendingVideo {
  video_id: string;
  video_title: string;
  creator_name: string;
  brand: string;
  total_gmv: number;
  first_seen: string;
  days_since_posted: number;
  video_link: string | null;
}

export interface TopVideo {
  video_id: string;
  video_title: string;
  creator_name: string;
  brand: string;
  total_gmv: number;
  total_orders: number;
  video_link: string | null;
}

export interface BreakoutCreator {
  creator_name: string;
  brand: string;
  current_gmv: number;
  prior_gmv: number;
  growth_pct: number;
}

const yesterday = () => subDays(new Date(), 1);

/** Paginated fetch to bypass Supabase PostgREST row limits */
async function paginatedFetch(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  table: string,
  select: string,
  filters: { column: string; op: string; value: unknown }[],
  pageSize = 1000
): Promise<any[]> {
  const all: any[] = [];
  let from = 0;
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + pageSize - 1);
    for (const f of filters) {
      if (f.op === 'gte') q = q.gte(f.column, f.value as string);
      else if (f.op === 'lte') q = q.lte(f.column, f.value as string);
      else if (f.op === 'in') q = q.in(f.column, f.value as string[]);
    }
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

/** Rising Videos — highest GMV acceleration (last 3 days vs prior 3 days) */
export async function getRisingVideos(limit = 10): Promise<RisingVideo[]> {
  const supabase = await createAdminClient();
  const end = yesterday();
  const recentStart = format(subDays(end, 2), 'yyyy-MM-dd');
  const recentEnd = format(end, 'yyyy-MM-dd');
  const priorEnd = format(subDays(end, 3), 'yyyy-MM-dd');
  const priorStart = format(subDays(end, 5), 'yyyy-MM-dd');

  const brands = [...ACTIVE_BRANDS];

  // Get recent period aggregated by video
  const recentData = await paginatedFetch(supabase, 'video_performance',
    'video_id, video_title, creator_name, brand, gmv, video_link',
    [
      { column: 'report_date', op: 'gte', value: recentStart },
      { column: 'report_date', op: 'lte', value: recentEnd },
      { column: 'brand', op: 'in', value: brands },
    ]);
  console.log(`[whats-hot] Rising videos recent: ${recentData.length} rows (${recentStart} to ${recentEnd})`);

  const priorData = await paginatedFetch(supabase, 'video_performance',
    'video_id, gmv',
    [
      { column: 'report_date', op: 'gte', value: priorStart },
      { column: 'report_date', op: 'lte', value: priorEnd },
      { column: 'brand', op: 'in', value: brands },
    ]);
  console.log(`[whats-hot] Rising videos prior: ${priorData.length} rows (${priorStart} to ${priorEnd})`);

  // Aggregate recent by video_id
  const recentMap = new Map<string, { gmv: number; title: string; creator: string; brand: string; link: string | null }>();
  for (const row of recentData) {
    const vid = row.video_id as string;
    const existing = recentMap.get(vid);
    if (existing) {
      existing.gmv += (row.gmv as number) ?? 0;
    } else {
      recentMap.set(vid, {
        gmv: (row.gmv as number) ?? 0,
        title: (row.video_title as string) ?? 'Untitled',
        creator: (row.creator_name as string) ?? 'Unknown',
        brand: row.brand as string,
        link: (row.video_link as string) ?? null,
      });
    }
  }

  // Aggregate prior by video_id
  const priorMap = new Map<string, number>();
  for (const row of priorData) {
    const vid = row.video_id as string;
    priorMap.set(vid, (priorMap.get(vid) ?? 0) + ((row.gmv as number) ?? 0));
  }

  // Calculate growth
  const results: RisingVideo[] = [];
  for (const [videoId, recent] of recentMap) {
    const recentAvg = recent.gmv / 3;
    const priorTotal = priorMap.get(videoId) ?? 0;
    const priorAvg = priorTotal / 3;

    // Only include videos that had some prior activity and meaningful recent GMV
    if (priorAvg < 1 || recentAvg < 5) continue;

    const growthPct = ((recentAvg - priorAvg) / priorAvg) * 100;
    if (growthPct <= 0) continue;

    results.push({
      video_id: videoId,
      video_title: recent.title,
      creator_name: recent.creator,
      brand: recent.brand,
      recent_avg_gmv: recentAvg,
      prior_avg_gmv: priorAvg,
      growth_pct: growthPct,
      video_link: recent.link,
    });
  }

  results.sort((a, b) => b.growth_pct - a.growth_pct);
  return results.slice(0, limit);
}

/** Trending Content — new videos (first seen last 7 days) with significant GMV */
export async function getTrendingVideos(limit = 10): Promise<TrendingVideo[]> {
  const supabase = await createAdminClient();
  const end = yesterday();
  const weekAgo = format(subDays(end, 6), 'yyyy-MM-dd');
  const endStr = format(end, 'yyyy-MM-dd');
  const brands = [...ACTIVE_BRANDS];

  // Get all video performance for last 14 days to find first_seen
  const lookbackStart = format(subDays(end, 30), 'yyyy-MM-dd');

  const data = await paginatedFetch(supabase, 'video_performance',
    'video_id, video_title, creator_name, brand, gmv, report_date, video_link',
    [
      { column: 'report_date', op: 'gte', value: lookbackStart },
      { column: 'report_date', op: 'lte', value: endStr },
      { column: 'brand', op: 'in', value: brands },
    ]);
  console.log(`[whats-hot] Trending videos: ${data.length} rows (${lookbackStart} to ${endStr})`);

  // Group by video_id, find first_seen and total GMV
  const videoMap = new Map<string, {
    title: string; creator: string; brand: string; gmv: number;
    firstSeen: string; link: string | null;
  }>();

  for (const row of data) {
    const vid = row.video_id as string;
    const existing = videoMap.get(vid);
    const gmv = (row.gmv as number) ?? 0;
    const reportDate = row.report_date as string;
    if (existing) {
      existing.gmv += gmv;
      if (reportDate < existing.firstSeen) existing.firstSeen = reportDate;
    } else {
      videoMap.set(vid, {
        title: (row.video_title as string) ?? 'Untitled',
        creator: (row.creator_name as string) ?? 'Unknown',
        brand: row.brand as string,
        gmv,
        firstSeen: reportDate,
        link: (row.video_link as string) ?? null,
      });
    }
  }

  const results: TrendingVideo[] = [];
  for (const [videoId, v] of videoMap) {
    if (v.firstSeen < weekAgo) continue; // Not new
    if (v.gmv < 1) continue;

    const daysSince = Math.max(1, Math.round((end.getTime() - new Date(v.firstSeen).getTime()) / 86400000));
    results.push({
      video_id: videoId,
      video_title: v.title,
      creator_name: v.creator,
      brand: v.brand,
      total_gmv: v.gmv,
      first_seen: v.firstSeen,
      days_since_posted: daysSince,
      video_link: v.link,
    });
  }

  results.sort((a, b) => b.total_gmv - a.total_gmv);
  return results.slice(0, limit);
}

/** Top Videos — highest GMV in date range */
export async function getTopVideos(startDate: string, endDate: string, limit = 10): Promise<TopVideo[]> {
  const supabase = await createAdminClient();
  const brands = [...ACTIVE_BRANDS];

  const data = await paginatedFetch(supabase, 'video_performance',
    'video_id, video_title, creator_name, brand, gmv, orders, video_link',
    [
      { column: 'report_date', op: 'gte', value: startDate },
      { column: 'report_date', op: 'lte', value: endDate },
      { column: 'brand', op: 'in', value: brands },
    ]);
  console.log(`[whats-hot] Top videos: ${data.length} rows (${startDate} to ${endDate})`);

  const videoMap = new Map<string, TopVideo>();
  for (const row of data) {
    const vid = row.video_id as string;
    const existing = videoMap.get(vid);
    if (existing) {
      existing.total_gmv += (row.gmv as number) ?? 0;
      existing.total_orders += (row.orders as number) ?? 0;
    } else {
      videoMap.set(vid, {
        video_id: vid,
        video_title: (row.video_title as string) ?? 'Untitled',
        creator_name: (row.creator_name as string) ?? 'Unknown',
        brand: row.brand as string,
        total_gmv: (row.gmv as number) ?? 0,
        total_orders: (row.orders as number) ?? 0,
        video_link: (row.video_link as string) ?? null,
      });
    }
  }

  const results = Array.from(videoMap.values());
  results.sort((a, b) => b.total_gmv - a.total_gmv);
  return results.slice(0, limit);
}

/** Breakout Creators — current period GMV 2x+ prior period */
export async function getBreakoutCreators(
  startDate: string,
  endDate: string,
  limit = 10
): Promise<BreakoutCreator[]> {
  const supabase = await createAdminClient();
  const brands = [...ACTIVE_BRANDS];

  const start = new Date(startDate);
  const end = new Date(endDate);
  const periodDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const priorEnd = format(subDays(start, 1), 'yyyy-MM-dd');
  const priorStart = format(subDays(start, periodDays), 'yyyy-MM-dd');

  const [currentData, priorData] = await Promise.all([
    paginatedFetch(supabase, 'creator_performance', 'creator_name, brand, gmv', [
      { column: 'report_date', op: 'gte', value: startDate },
      { column: 'report_date', op: 'lte', value: endDate },
      { column: 'brand', op: 'in', value: brands },
    ]),
    paginatedFetch(supabase, 'creator_performance', 'creator_name, brand, gmv', [
      { column: 'report_date', op: 'gte', value: priorStart },
      { column: 'report_date', op: 'lte', value: priorEnd },
      { column: 'brand', op: 'in', value: brands },
    ]),
  ]);
  console.log(`[whats-hot] Breakout creators: current=${currentData.length}, prior=${priorData.length} rows`);

  // Aggregate by creator+brand
  const currentMap = new Map<string, { creator: string; brand: string; gmv: number }>();
  for (const row of currentData) {
    const key = `${row.creator_name}::${row.brand}`;
    const existing = currentMap.get(key);
    if (existing) {
      existing.gmv += (row.gmv as number) ?? 0;
    } else {
      currentMap.set(key, { creator: row.creator_name as string, brand: row.brand as string, gmv: (row.gmv as number) ?? 0 });
    }
  }

  const priorMap = new Map<string, number>();
  for (const row of priorData) {
    const key = `${row.creator_name}::${row.brand}`;
    priorMap.set(key, (priorMap.get(key) ?? 0) + ((row.gmv as number) ?? 0));
  }

  const results: BreakoutCreator[] = [];
  for (const [key, current] of currentMap) {
    const priorGmv = priorMap.get(key) ?? 0;
    if (priorGmv < 10) continue; // Need meaningful prior to be a "breakout"
    const growthPct = ((current.gmv - priorGmv) / priorGmv) * 100;
    if (growthPct < 100) continue; // 2x minimum

    results.push({
      creator_name: current.creator,
      brand: current.brand,
      current_gmv: current.gmv,
      prior_gmv: priorGmv,
      growth_pct: growthPct,
    });
  }

  results.sort((a, b) => b.growth_pct - a.growth_pct);
  return results.slice(0, limit);
}
