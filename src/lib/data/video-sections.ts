import { createClient } from '@/lib/supabase/server';
import { ACTIVE_BRANDS } from '@/lib/utils/constants';
import { getBrandRegistry, slugToUuid, expandSlugs } from '@/lib/data/brand-registry';

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
  const supabase = await createClient();
  const reg = await getBrandRegistry();

  // Expand umbrella roster slugs (e.g. 'leefar') to per-store data slugs
  // before mapping to UUIDs — videos are keyed by the store UUID, not the
  // umbrella's UUID. (Null branch stays ACTIVE_BRANDS, NOT activeBrandSlugs:
  // getDashboardVideos isn't workspace-scoped, so widening to all active brands
  // would fail-open a manager's standouts — that's a separate scoped-roster fix.)
  const rosterBrands = brandFilter ? [brandFilter] : [...ACTIVE_BRANDS];
  const dataBrands = rosterBrands.flatMap(b => expandSlugs(reg, b));
  const brandUuids = dataBrands.map(b => slugToUuid(reg, b)).filter((x): x is string => Boolean(x));

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
