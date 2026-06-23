/**
 * Supabase client for the Discord bot (standalone process, not Next.js).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { buildRegistry, type BrandRegistry, type BrandRow } from '@/lib/data/brand-registry-core';

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('[tempo-bot] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    _client = createClient(url, key);
  }
  return _client;
}

/** Brand registry for the standalone bot — built from the bot's OWN Supabase
 *  client. (We can't use getBrandRegistry from '@/lib/data/brand-registry' here:
 *  it imports the Next admin client, which pulls in next/headers and crashes
 *  outside Next.) Pure helpers (brandLabel/brandColor) come from
 *  '@/lib/data/brand-registry-core'. */
export async function getBotBrandRegistry(): Promise<BrandRegistry> {
  const { data } = await getSupabase()
    .from('brands_v2')
    .select('id, slug, name, display_name, color, is_archived, is_umbrella, parent_brand_id, store_order');
  return buildRegistry((data ?? []) as BrandRow[]);
}

/** Helper: get date N days ago as YYYY-MM-DD */
export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Parse period string to number of days */
export function periodToDays(period: string): number {
  switch (period) {
    case '7d': return 7;
    case '14d': return 14;
    case '30d': return 30;
    case 'month': {
      const now = new Date();
      return now.getDate(); // days into current month
    }
    default: return 7;
  }
}
