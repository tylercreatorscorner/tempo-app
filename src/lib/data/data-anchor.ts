/**
 * "How current is the data?" — one answer, shared by every surface that shows
 * a rolling window.
 *
 * TikTok Shop exports run behind. On 2026-08-24, 18 of 19 brands had data only
 * through 08-21. Anything that ends a window on calendar yesterday therefore
 * measures a SHORT current period against a FULL prior one and reports the
 * difference as performance. See the long note on resolveDateRange for the
 * measured damage; this module is where the honest end date comes from.
 *
 * Server-only (createAdminClient reaches next/headers). Never import from a
 * client bundle. See [[project_nextjs_client_server_boundary]].
 */
import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * The last date that actually has creator data, scoped to the given brands.
 *
 * Pass the brands the page is ACTUALLY showing. The anchor for a multi-brand
 * view is the max across that whole selection, never per brand: cosrx was 32
 * days stale on 2026-08-24, and anchoring it to its own last upload would put
 * July cosrx rows inside an August total. Scoped to the selection, a dark brand
 * reads zero and the stale-brand banner is what flags it.
 *
 * ⚠️ Returns null rather than a guess when the lookup fails or the scope has no
 * rows. resolveDateRange treats null as "no anchor" and falls back to the
 * original calendar behaviour, so a broken lookup degrades to the old numbers
 * instead of inventing a window.
 *
 * ⚠️ Reads daily_creator_stats, the table the admin GMV surfaces aggregate.
 * daily_video_product_stats can land on a different day; a surface that reads
 * THAT table should anchor on it instead (getWhatsCookingData in
 * discord-posts.ts does exactly this).
 *
 * Wrapped in React cache() so a page resolving its range and then rendering a
 * freshness note shares one read.
 */
export const getDataAnchorDate = cache(async (
  brandSlugs?: string[] | null,
): Promise<string | null> => {
  try {
    const supabase = await createAdminClient();

    let brandIds: string[] | null = null;
    if (brandSlugs && brandSlugs.length > 0) {
      const { data: rows, error } = await supabase
        .from('brands_v2')
        .select('id')
        .in('slug', brandSlugs);
      if (error) return null;
      brandIds = (rows ?? []).map((r: { id: string }) => r.id);
      // An empty scope means "these brands have no rows", which is not the same
      // as "no scope". Returning null here would silently widen the anchor to
      // every brand in the workspace.
      if (brandIds.length === 0) return null;
    }

    let query = supabase
      .from('daily_creator_stats')
      .select('report_date')
      .order('report_date', { ascending: false })
      .limit(1);
    if (brandIds) query = query.in('brand_id', brandIds);

    const { data, error } = await query;
    if (error) return null;
    return (data?.[0]?.report_date as string | undefined) ?? null;
  } catch {
    return null;
  }
});
