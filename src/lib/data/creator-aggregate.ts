import { createClient } from '@/lib/supabase/server';
import { getCreatorRetainers, getTotalRetainer, type RetainerInfo } from './retainer';

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
  managed_creator_id?: string;
  isManaged: boolean;
  retainer: number;
  productRetainers: Record<string, number>;
}

/**
 * Fetches the mapping of TikTok usernames to real names from
 * tiktok_accounts joined with creators_v2.
 */
async function fetchHandleToRealName(): Promise<Map<string, { real_name: string; creator_id: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tiktok_accounts')
    .select('tiktok_username, creator_id, creator:creators_v2(real_name)')
    .not('tiktok_username', 'is', null);

  if (error || !data) {
    console.error('Failed to fetch creator account mappings:', error);
    return new Map();
  }

  const map = new Map<string, { real_name: string; creator_id: string }>();
  for (const row of data) {
    const username = row.tiktok_username;
    const mc = row.creator as unknown as { real_name: string } | null;
    if (username && mc?.real_name) {
      map.set(username.toLowerCase(), {
        real_name: mc.real_name,
        creator_id: row.creator_id as string,
      });
    }
  }
  return map;
}

/**
 * Groups raw creator rows by real name (or by handle if unmanaged).
 * Aggregates GMV, orders, items, videos across multiple handles.
 */
export async function aggregateCreatorsByRealName(
  creators: RawCreator[],
  brandFilter?: string | null
): Promise<GroupedCreator[]> {
  const [handleMap, retainerMap] = await Promise.all([
    fetchHandleToRealName(),
    getCreatorRetainers(),
  ]);

  const groups = new Map<string, GroupedCreator>();

  for (const c of creators) {
    const mapping = handleMap.get(c.creator_name.toLowerCase());
    const realName = mapping?.real_name;
    const creatorId = mapping?.creator_id;
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
      if (creatorId && !existing.managed_creator_id) {
        existing.managed_creator_id = creatorId;
        existing.isManaged = true;
        const ri = retainerMap.get(creatorId);
        if (ri) {
          existing.retainer = getTotalRetainer(ri.retainer, ri.productRetainers, brandFilter);
          existing.productRetainers = ri.productRetainers;
        }
      }
    } else {
      const isManaged = !!creatorId;
      const ri = creatorId ? retainerMap.get(creatorId) : undefined;
      groups.set(key, {
        display_name: realName ?? c.creator_name,
        handles: [c.creator_name],
        total_gmv: c.total_gmv ?? 0,
        total_orders: c.total_orders ?? 0,
        total_items_sold: c.total_items_sold ?? 0,
        days_active: c.days_active ?? 0,
        total_videos: c.total_videos ?? 0,
        brand: c.brand,
        managed_creator_id: creatorId,
        isManaged,
        retainer: ri ? getTotalRetainer(ri.retainer, ri.productRetainers, brandFilter) : 0,
        productRetainers: ri?.productRetainers ?? {},
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) => b.total_gmv - a.total_gmv);
}
