import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { classifyCreator } from '@/lib/data/creator-status';
import { STATUS_CONFIG } from '@/lib/data/creator-status';
import { getBrandRegistry, uuidToSlug } from '@/lib/data/brand-registry';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ creatorId: string }> }
) {
  try {
    const scope = await getWorkspaceScope();
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { creatorId } = await params;
    const supabase = await createAdminClient();
    const reg = await getBrandRegistry();

    // Get creator info from creators_v2 — tenant-pinned (service role bypasses RLS)
    const { data: creator, error } = await supabase
      .from('creators_v2')
      .select('id, real_name, discord_id, discord_avatar')
      .eq('id', creatorId)
      .eq('tenant_id', scope.tenantId)
      .single();

    if (error || !creator) {
      return NextResponse.json({ creator: null });
    }

    // Scoped (manager): creator must be linked to one of their brands.
    if (scope.brandScope.kind === 'scoped') {
      const ids = scope.brandScope.brandIds;
      const { data: link } = await supabase
        .from('creator_brands').select('id').eq('creator_id', creator.id)
        .in('brand_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
        .limit(1);
      if (!link || link.length === 0) {
        return NextResponse.json({ error: 'Forbidden: creator not in your brands' }, { status: 403 });
      }
    }

    // Get brand-specific data
    const { data: brandRow } = await supabase
      .from('creator_brands')
      .select('brand_id, retainer')
      .eq('creator_id', creator.id)
      .limit(1)
      .single();

    const brandSlug = brandRow ? (uuidToSlug(reg, brandRow.brand_id) ?? brandRow.brand_id) : null;

    // Get TikTok handle from tiktok_accounts
    const { data: account } = await supabase
      .from('tiktok_accounts')
      .select('tiktok_username')
      .eq('creator_id', creator.id)
      .limit(1)
      .single();

    const tiktokHandle = account?.tiktok_username || null;

    let posts7d = 0;
    let gmv7d = 0;
    let lastActive: string | null = null;
    const brandBreakdown: Array<{ brand: string; posts_7d: number; gmv_7d: number }> = [];

    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const dateStr = sevenDaysAgo.toISOString().split('T')[0];

      const { data: allAccounts } = await supabase
        .from('tiktok_accounts')
        .select('tiktok_username, brand_id')
        .eq('creator_id', creator.id);

      const usernames = (allAccounts ?? []).map(a => a.tiktok_username);
      const usernameToBrand: Record<string, string> = {};
      for (const a of allAccounts ?? []) {
        usernameToBrand[a.tiktok_username.toLowerCase()] = uuidToSlug(reg, a.brand_id) ?? a.brand_id;
      }

      if (usernames.length > 0) {
        // GMV from daily_video_product_stats
        const { data: salesRows } = await supabase
          .from('daily_video_product_stats')
          .select('video_id, gmv, report_date, tiktok_username, brand_id')
          .in('tiktok_username', usernames)
          .gte('report_date', dateStr)
          .order('report_date', { ascending: false });

        if (salesRows && salesRows.length > 0) {
          gmv7d = salesRows.reduce((sum: number, v: any) => sum + (Number(v.gmv) || 0), 0);
          lastActive = salesRows[0].report_date;

          const brandGmvMap = new Map<string, number>();
          for (const v of salesRows) {
            const b = uuidToSlug(reg, v.brand_id) ?? usernameToBrand[v.tiktok_username?.toLowerCase()] ?? 'unknown';
            brandGmvMap.set(b, (brandGmvMap.get(b) || 0) + (Number(v.gmv) || 0));
          }

          // Post counts. Source: daily_video_product_stats (rows are per
          // video×product; Set<video_id> below dedupes correctly).
          const { data: postRows } = await supabase
            .from('daily_video_product_stats')
            .select('video_id, tiktok_username, brand_id')
            .in('tiktok_username', usernames)
            .gte('post_date', dateStr);

          const allPosts = new Set<string>();
          const brandPostMap = new Map<string, Set<string>>();
          for (const v of postRows ?? []) {
            allPosts.add(v.video_id);
            const b = uuidToSlug(reg, v.brand_id) ?? usernameToBrand[v.tiktok_username?.toLowerCase()] ?? 'unknown';
            if (!brandPostMap.has(b)) brandPostMap.set(b, new Set());
            brandPostMap.get(b)!.add(v.video_id);
          }
          posts7d = allPosts.size;

          const allBrands = new Set([...brandGmvMap.keys(), ...brandPostMap.keys()]);
          for (const brand of allBrands) {
            brandBreakdown.push({
              brand,
              posts_7d: brandPostMap.get(brand)?.size || 0,
              gmv_7d: Math.round((brandGmvMap.get(brand) || 0) * 100) / 100,
            });
          }
        }
      }
    } catch {
      // Performance tables may not exist
    }

    const status = classifyCreator(posts7d);

    return NextResponse.json({
      creator: {
        id: creator.id,
        real_name: creator.real_name,
        tiktok_handle: tiktokHandle,
        brand: brandSlug,
        discord_id: creator.discord_id,
        retainer_amount: brandRow?.retainer != null ? Number(brandRow.retainer) : null,
        discord_avatar: creator.discord_avatar,
        status,
        status_label: STATUS_CONFIG[status].label,
        posts_7d: posts7d,
        gmv_7d: Math.round(gmv7d * 100) / 100,
        last_active: lastActive,
        brand_breakdown: brandBreakdown,
      },
    });
  } catch (err) {
    console.error('Failed to fetch creator context:', err);
    return NextResponse.json({ creator: null }, { status: 200 });
  }
}
