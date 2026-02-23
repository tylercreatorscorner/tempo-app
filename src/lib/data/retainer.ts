import { createAdminClient } from '@/lib/supabase/server';

export interface RetainerInfo {
  retainer: number;
  productRetainers: Record<string, number>;
}

/**
 * Fetches retainer data for all active managed creators.
 * Returns a Map of creator_id -> RetainerInfo.
 */
export async function getCreatorRetainers(): Promise<Map<number, RetainerInfo>> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('managed_creators')
    .select('id, retainer, product_retainers')
    .eq('status', 'Active');

  if (error || !data) {
    console.error('Failed to fetch creator retainers:', error);
    return new Map();
  }

  const map = new Map<number, RetainerInfo>();
  for (const row of data) {
    map.set(row.id, {
      retainer: row.retainer ?? 0,
      productRetainers: (row.product_retainers as Record<string, number>) ?? {},
    });
  }
  return map;
}

/**
 * Calculates total retainer for a creator, optionally filtered by brand.
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
