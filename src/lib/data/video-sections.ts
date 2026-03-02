import { createAdminClient } from '@/lib/supabase/server';
import { ACTIVE_BRANDS, BRAND_UUID_MAP } from '@/lib/utils/constants';
import { format, subDays } from 'date-fns';

export interface DashboardVideo {
  video_id: string;
  video_url: string | null;
  video_title: string;
  tiktok_username: string;
  total_gmv: number;
  total_orders: number;
  post_date: string | null;
}

/**
 * Fetch videos for the three dashboard sections:
 * - Hot Now: posted last 7 days, $100+ GMV
 * - Rising: posted 7-14 days ago with sales
 * - Top Performers: highest GMV in selected date range
 *
 * Uses direct queries against daily_video_stats (the RPC get_dashboard_videos
 * was never deployed to Supabase, so we fall back to paginated client-side
 * aggregation until the migration is run).
 */
export async function getDashboardVideos(
  brandFilter: string | null,
  startDate: string,
  endDate: string
): Promise<{
  hotNow: DashboardVideo[];
  rising: DashboardVideo[];
  topPerformers: DashboardVideo[];
}> {
  const supabase = await createAdminClient();

  const brandUuids = brandFilter
    ? [BRAND_UUID_MAP[brandFilter]].filter(Boolean)
    : [...ACTIVE_BRANDS].map((b) => BRAND_UUID_MAP[b]).filter(Boolean);

  if (brandUuids.length === 0) {
    return { hotNow: [], rising: [], topPerformers: [] };
  }

  // Paginated fetch to bypass PostgREST 1000-row limit
  const allData: Record<string, unknown>[] = [];
  const PAGE_SIZE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('daily_video_stats')
      .select('video_id, video_url, video_title, tiktok_username, post_date, gmv, orders, brand_id')
      .gte('report_date', startDate)
      .lte('report_date', endDate)
      .in('brand_id', brandUuids)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('[video-sections] Query failed:', error);
      return { hotNow: [], rising: [], topPerformers: [] };
    }
    if (!data || data.length === 0) break;
    allData.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  const data = allData;

  // Aggregate by video_id
  const videoMap = new Map<string, DashboardVideo>();
  for (const row of data ?? []) {
    const vid = row.video_id as string;
    const existing = videoMap.get(vid);
    if (existing) {
      existing.total_gmv += (row.gmv as number) ?? 0;
      existing.total_orders += (row.orders as number) ?? 0;
    } else {
      videoMap.set(vid, {
        video_id: vid,
        video_url: (row.video_url as string) ?? null,
        video_title: (row.video_title as string) ?? 'Untitled',
        tiktok_username: (row.tiktok_username as string) ?? 'Unknown',
        total_gmv: (row.gmv as number) ?? 0,
        total_orders: (row.orders as number) ?? 0,
        post_date: (row.post_date as string) ?? null,
      });
    }
  }

  const now = new Date();
  const sevenDaysAgo = format(subDays(now, 7), 'yyyy-MM-dd');
  const fourteenDaysAgo = format(subDays(now, 14), 'yyyy-MM-dd');

  const allVideos = Array.from(videoMap.values());

  // Hot Now: posted within last 7 days, $100+ GMV
  const hotNow = allVideos
    .filter((v) => v.post_date && v.post_date >= sevenDaysAgo && v.total_gmv >= 100)
    .sort((a, b) => b.total_gmv - a.total_gmv);

  // Rising: posted 7-14 days ago with sales
  const rising = allVideos
    .filter((v) => v.post_date && v.post_date >= fourteenDaysAgo && v.post_date < sevenDaysAgo && v.total_gmv > 0)
    .sort((a, b) => b.total_gmv - a.total_gmv);

  // Top Performers: highest GMV overall (limit to 20)
  const topPerformers = [...allVideos]
    .sort((a, b) => b.total_gmv - a.total_gmv)
    .slice(0, 20);

  return { hotNow, rising, topPerformers };
}
