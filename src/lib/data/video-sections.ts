import { createAdminClient } from '@/lib/supabase/server';
import { ACTIVE_BRANDS, BRAND_UUID_MAP } from '@/lib/utils/constants';

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
 * Fetch videos for the three dashboard sections using the
 * get_dashboard_videos RPC function (server-side aggregation).
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

  const { data, error } = await supabase.rpc('get_dashboard_videos', {
    p_brand_ids: brandUuids,
    p_start_date: startDate,
    p_end_date: endDate,
    p_limit: 20,
  });

  if (error) {
    console.error('[video-sections] RPC failed:', error);
    return { hotNow: [], rising: [], topPerformers: [] };
  }

  console.log('[video-sections] brandUuids:', brandUuids, 'startDate:', startDate, 'endDate:', endDate, 'rows:', data?.length ?? 0);
  
  if (data?.length) {
    const sections: Record<string, number> = {};
    for (const row of data) { sections[row.section] = (sections[row.section] || 0) + 1; }
    console.log('[video-sections] sections:', sections, 'sample row keys:', Object.keys(data[0]));
  }

  const hotNow: DashboardVideo[] = [];
  const rising: DashboardVideo[] = [];
  const topPerformers: DashboardVideo[] = [];

  for (const row of data ?? []) {
    const video: DashboardVideo = {
      video_id: row.video_id,
      video_url: row.video_url ?? null,
      video_title: row.video_title ?? 'Untitled',
      tiktok_username: row.tiktok_username ?? 'Unknown',
      total_gmv: Number(row.total_gmv) ?? 0,
      total_orders: Number(row.total_orders) ?? 0,
      post_date: row.post_date ?? null,
    };

    switch (row.section) {
      case 'hot_now':
        hotNow.push(video);
        break;
      case 'rising':
        rising.push(video);
        break;
      case 'top_performers':
        topPerformers.push(video);
        break;
    }
  }

  return { hotNow, rising, topPerformers };
}
