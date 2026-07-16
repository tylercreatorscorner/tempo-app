import { createClient } from '@/lib/supabase/server';
import { getCreatorRetainers, getTotalRetainer } from './retainer';

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
async function fetchHandleToRealName(handles: string[]): Promise<Map<string, { real_name: string; creator_id: string }>> {
  if (handles.length === 0) return new Map();
  // Case-insensitive lookup: TikTok handles are case-insensitive and stored
  // lowercased (migration 063 + the normalize-on-write trigger), so lowercase
  // the lookup keys too. Without this a mixed-case handle silently fails to
  // resolve as managed (no real name, excluded from managed-share / ROI).
  const normalized = Array.from(new Set(handles.map((h) => h.toLowerCase())));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tiktok_accounts')
    .select('tiktok_username, creator_id, creator:creators_v2(real_name)')
    .in('tiktok_username', normalized);

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

export interface HandleDisplayMeta {
  /** creators_v2.real_name */
  name: string;
  /** creators_v2 id — the creator detail-page id. */
  id: string;
}

/**
 * normalized handle → { real name, creator id }, for a KNOWN set of handles.
 *
 * The dashboard only ever needed this: display names for the handles it already
 * has from computeManagedGmv. It used to get them by fanning out
 * get_creator_rankings across all 28 brands at 50 rows each (28 blocking RPCs
 * + 2 more inside aggregateCreatorsByRealName) and then throwing ~99% of the
 * result away. This is one chunked read of exactly the handles asked for.
 *
 * Two things this fixes versus the old path:
 *  - CHUNKED. The old `.in()` took every handle in one list, which both
 *    overflows the request URL and truncates at PostgREST's 1000-row cap —
 *    silently, so handles just lost their real name.
 *  - DETERMINISTIC. 55 handles map to more than one creator_id (one to nine),
 *    so first-wins over unordered rows let a creator's displayed name change
 *    between identical renders. Oldest account wins, stably.
 *
 * Throws on error rather than returning a partial map: a half-resolved lookup
 * silently downgrades real names to raw handles and — because the id is the
 * aggregation key — splits one person into several rows in Top Creators.
 */
export async function fetchHandleDisplayMeta(handles: string[]): Promise<Map<string, HandleDisplayMeta>> {
  const normalized = Array.from(
    new Set(handles.map((h) => h.replace(/^@/, '').trim().toLowerCase()).filter(Boolean)),
  );
  const out = new Map<string, HandleDisplayMeta>();
  if (normalized.length === 0) return out;

  const supabase = await createClient();
  // 400/batch keeps the URL well short of its limit and the response well under
  // the 1000-row cap (a handle resolves to ~1 row, a few to several).
  const CHUNK = 400;
  for (let i = 0; i < normalized.length; i += CHUNK) {
    const batch = normalized.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('tiktok_accounts')
      .select('tiktok_username, creator_id, created_at, creator:creators_v2(real_name)')
      .in('tiktok_username', batch)
      // Load-bearing: makes the multi-creator_id pick stable (oldest wins).
      .order('created_at', { ascending: true });
    if (error) throw new Error(`fetchHandleDisplayMeta failed: ${error.message}`);
    for (const row of data ?? []) {
      const handle = (row.tiktok_username as string | null)?.toLowerCase();
      const creator = row.creator as unknown as { real_name: string | null } | null;
      if (!handle || !creator?.real_name || !row.creator_id) continue;
      if (!out.has(handle)) out.set(handle, { name: creator.real_name, id: row.creator_id as string });
    }
  }
  return out;
}

/**
 * Groups raw creator rows by real name (or by handle if unmanaged).
 * Aggregates GMV, orders, items, videos across multiple handles.
 */
export async function aggregateCreatorsByRealName(
  creators: RawCreator[],
  brandFilter?: string | null
): Promise<GroupedCreator[]> {
  const handles = creators.map(c => c.creator_name);
  const [handleMap, retainerMap] = await Promise.all([
    fetchHandleToRealName(handles),
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
