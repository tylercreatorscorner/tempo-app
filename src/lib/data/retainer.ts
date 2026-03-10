import { createClient } from '@/lib/supabase/server';
import { brandSlugToUuid, brandUuidToSlug } from '@/lib/utils/constants';

export interface RetainerInfo {
  retainer: number;
  productRetainers: Record<string, number>;
}

/**
 * Fetches retainer data for all active creator-brand relationships.
 * Returns a Map of creator_id (UUID) -> RetainerInfo.
 */
export async function getCreatorRetainers(): Promise<Map<string, RetainerInfo>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('creator_brands')
    .select('creator_id, retainer, product_retainers')
    .eq('status', 'Active');

  if (error || !data) {
    console.error('Failed to fetch creator retainers:', error);
    return new Map();
  }

  const map = new Map<string, RetainerInfo>();
  for (const row of data) {
    map.set(row.creator_id, {
      retainer: row.retainer ?? 0,
      productRetainers: (row.product_retainers as Record<string, number>) ?? {},
    });
  }
  return map;
}

/**
 * Calculates total retainer for a creator, optionally filtered by brand slug.
 * Total = base retainer + product_retainers[brand] (or sum of all product retainers if no brand filter).
 */
export function getTotalRetainer(
  baseRetainer: number,
  productRetainers: Record<string, number>,
  brand?: string | null
): number {
  if (brand) return baseRetainer + (productRetainers[brand] ?? 0);
  return baseRetainer + Object.values(productRetainers).reduce((s, v) => s + v, 0);
}
