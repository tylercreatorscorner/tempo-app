import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { classifyCreator, STATUS_CONFIG } from '@/lib/data/creator-status';
import { resolveUuids, uuidToSlug } from '@/lib/data/brand-registry-core';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { messageBrandRegistry, messageCreator, messageGuard, messageReply } from '@/lib/messages/access';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ creatorId: string }> }) {
  try {
    const scope = await getWorkspaceScope();
    const denied = messageGuard(scope);
    if (denied || !scope) return denied!;
    const { creatorId } = await params;
    const db = await createAdminClient();
    const creator = await messageCreator(scope, db, creatorId);
    if (creator instanceof NextResponse) return creator;
    const registry = await messageBrandRegistry(scope, db);
    const brandIds = registry.rows.map(brand => brand.id);
    const [links, accounts] = await Promise.all([
      db.from('creator_brands').select('brand_id,retainer', { count: 'exact' }).eq('tenant_id', scope.tenantId).eq('creator_id', creatorId).in('brand_id', brandIds),
      db.from('tiktok_accounts').select('tiktok_username,brand_id', { count: 'exact' }).eq('tenant_id', scope.tenantId).eq('creator_id', creatorId).in('brand_id', brandIds),
    ]);
    if ([links, accounts].some(result => result.error || !result.data || result.count !== result.data.length)) throw new Error('Incomplete creator context');
    const linkedBrandIds = [...new Set((links.data ?? []).map(row => row.brand_id as string))];
    const dataBrandIds = [...new Set(linkedBrandIds.flatMap(id => resolveUuids(registry, uuidToSlug(registry, id), id) ?? []))];
    const usernames = [...new Set((accounts.data ?? []).map(row => row.tiktok_username as string).filter(Boolean))];
    const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const byBrand = new Map<string, { gmv: number; videos: Set<string> }>();
    const allVideos = new Set<string>();
    let gmv = 0, lastActive: string | null = null;
    if (usernames.length && linkedBrandIds.length) {
      for (const basis of ['report_date', 'post_date'] as const) {
        for (let page = 0; ; page++) {
          const result = await db.from('daily_video_product_stats').select('id,video_id,gmv,report_date,post_date,brand_id', { count: 'exact' })
            .eq('tenant_id', scope.tenantId).in('brand_id', dataBrandIds).in('tiktok_username', usernames)
            .gte(basis, since).order('id').range(page * 1000, page * 1000 + 999);
          if (result.error || !result.data || result.count === null) throw new Error('Creator performance unavailable');
          for (const row of result.data) {
            const value = byBrand.get(row.brand_id) ?? { gmv: 0, videos: new Set<string>() };
            if (basis === 'report_date') { value.gmv += Number(row.gmv) || 0; gmv += Number(row.gmv) || 0; }
            else if (row.video_id) { value.videos.add(row.video_id); allVideos.add(row.video_id); }
            const date = row[basis] as string | null;
            if (date && (!lastActive || date > lastActive)) lastActive = date;
            byBrand.set(row.brand_id, value);
          }
          if ((page + 1) * 1000 >= result.count) break;
          if (result.data.length !== 1000) throw new Error('Incomplete creator performance');
        }
      }
    }
    const brandRow = links.data?.[0];
    const status = classifyCreator(allVideos.size);
    return messageReply({ creator: {
      id: creator.id, real_name: creator.real_name, tiktok_handle: usernames[0] ?? null,
      brand: brandRow ? uuidToSlug(registry, brandRow.brand_id) : null, discord_id: creator.discord_id,
      retainer_amount: brandRow?.retainer != null ? Number(brandRow.retainer) : null, discord_avatar: creator.discord_avatar,
      status, status_label: STATUS_CONFIG[status].label, posts_7d: allVideos.size, gmv_7d: Math.round(gmv * 100) / 100, last_active: lastActive,
      brand_breakdown: [...byBrand].map(([brandId, value]) => ({ brand: uuidToSlug(registry, brandId) ?? brandId, posts_7d: value.videos.size, gmv_7d: Math.round(value.gmv * 100) / 100 })),
    } });
  } catch {
    return messageReply({ error: 'Could not load creator context. Please retry.' }, 503);
  }
}
