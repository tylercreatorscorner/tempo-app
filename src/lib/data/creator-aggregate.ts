import { createAdminClient } from '@/lib/supabase/server';

interface RawCreator {
  creator_name: string;
  total_gmv: number;
  total_orders: number;
  total_items_sold: number;
  days_active: number;
  total_videos: number;
  brand?: string;
}

export interface GroupedCreator {
  display_name: string;
  handles: string[];
  total_gmv: number;
  total_orders: number;
  total_items_sold: number;
  days_active: number;
  total_videos: number;
  brand?: string;
}

/**
 * Fetches the mapping of TikTok usernames to real names from
 * creator_accounts joined with managed_creators.
 */
async function fetchHandleToRealName(): Promise<Map<string, string>> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('creator_accounts')
    .select('tiktok_username, managed_creators(real_name)')
    .not('tiktok_username', 'is', null);

  if (error || !data) {
    console.error('Failed to fetch creator account mappings:', error);
    return new Map();
  }

  const map = new Map<string, string>();
  for (const row of data) {
    const username = row.tiktok_username;
    // managed_creators comes back as object (single FK relation)
    const mc = row.managed_creators as unknown as { real_name: string } | null;
    if (username && mc?.real_name) {
      map.set(username.toLowerCase(), mc.real_name);
    }
  }
  return map;
}

/**
 * Groups raw creator rows by real name (or by handle if unmanaged).
 * Aggregates GMV, orders, items, videos across multiple handles.
 */
export async function aggregateCreatorsByRealName(
  creators: RawCreator[]
): Promise<GroupedCreator[]> {
  const handleMap = await fetchHandleToRealName();

  const groups = new Map<string, GroupedCreator>();

  for (const c of creators) {
    const realName = handleMap.get(c.creator_name.toLowerCase());
    const key = realName?.toLowerCase() ?? c.creator_name.toLowerCase();

    const existing = groups.get(key);
    if (existing) {
      existing.total_gmv += c.total_gmv ?? 0;
      existing.total_orders += c.total_orders ?? 0;
      existing.total_items_sold += c.total_items_sold ?? 0;
      existing.total_videos += c.total_videos ?? 0;
      existing.days_active = Math.max(existing.days_active, c.days_active ?? 0);
      if (!existing.handles.includes(c.creator_name)) {
        existing.handles.push(c.creator_name);
      }
    } else {
      groups.set(key, {
        display_name: realName ?? c.creator_name,
        handles: [c.creator_name],
        total_gmv: c.total_gmv ?? 0,
        total_orders: c.total_orders ?? 0,
        total_items_sold: c.total_items_sold ?? 0,
        days_active: c.days_active ?? 0,
        total_videos: c.total_videos ?? 0,
        brand: c.brand,
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) => b.total_gmv - a.total_gmv);
}
