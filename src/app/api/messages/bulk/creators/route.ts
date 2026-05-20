import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { classifyCreator, type CreatorStatus } from '@/lib/data/creator-status';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';

export async function GET(request: NextRequest) {
  try {
    const scope = await getWorkspaceScope();
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const brand = url.searchParams.get('brand');
    const statusesParam = url.searchParams.get('statuses');
    const hasDiscord = url.searchParams.get('has_discord');

    const supabase = await createAdminClient();

    const scopedBrandIds =
      scope.brandScope.kind === 'scoped' ? scope.brandScope.brandIds : null;

    // Query creator_brands joined with creators_v2
    let query = supabase
      .from('creator_brands')
      .select('creator_id, brand_id, creator:creators_v2(id, real_name, discord_id)');

    if (brand) {
      const { brandSlugToUuid } = await import('@/lib/utils/constants');
      const brandUuid = brandSlugToUuid(brand);
      // A scoped user requesting a brand outside their access gets nothing.
      if (scopedBrandIds && (!brandUuid || !scopedBrandIds.includes(brandUuid))) {
        return NextResponse.json({ error: 'Forbidden: brand not in your access' }, { status: 403 });
      }
      if (brandUuid) query = query.eq('brand_id', brandUuid);
    } else if (scopedBrandIds) {
      // No brand specified: a manager sees only their brands' creators.
      query = query.in('brand_id',
        scopedBrandIds.length ? scopedBrandIds : ['00000000-0000-0000-0000-000000000000']);
    }

    const { data: rows, error } = await query;

    if (error) throw error;

    // Flatten and filter
    const creators = (rows ?? [])
      .filter((r: any) => r.creator)
      .map((r: any) => ({
        id: r.creator.id,
        real_name: r.creator.real_name,
        brand: r.brand_id,
        discord_id: r.creator.discord_id,
      }));

    // Filter by discord presence
    const filteredByDiscord = hasDiscord === 'yes'
      ? creators.filter((c: any) => c.discord_id)
      : hasDiscord === 'no'
        ? creators.filter((c: any) => !c.discord_id)
        : creators;

    // Compute real status from 7-day video counts rather than hardcoding 'ghost'
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const creatorIds = filteredByDiscord.map((c: any) => c.id);

    // Get tiktok handles for these creators so we can look up video counts by handle
    const { data: accounts } = await supabase
      .from('tiktok_accounts')
      .select('creator_id, tiktok_username')
      .in('creator_id', creatorIds);

    const handlesByCreator = new Map<string, string[]>();
    for (const a of accounts ?? []) {
      if (!handlesByCreator.has(a.creator_id)) handlesByCreator.set(a.creator_id, []);
      handlesByCreator.get(a.creator_id)!.push(a.tiktok_username.toLowerCase());
    }
    const allHandles = [...new Set([...handlesByCreator.values()].flat())];

    // Fetch 7-day video counts for all these handles in one shot
    const videosByHandle = new Map<string, Set<string>>();
    if (allHandles.length > 0) {
      const { data: vids } = await supabase
        // daily_video_product_stats is per video×product; Set<video_id>
        // below dedupes so per-creator video counts stay correct.
        .from('daily_video_product_stats')
        .select('tiktok_username, video_id')
        .gte('post_date', sevenDaysAgo)
        .in('tiktok_username', allHandles);

      for (const v of vids ?? []) {
        const h = v.tiktok_username?.toLowerCase();
        if (!h) continue;
        if (!videosByHandle.has(h)) videosByHandle.set(h, new Set());
        videosByHandle.get(h)!.add(v.video_id);
      }
    }

    const creatorList = filteredByDiscord.map((c: any) => {
      const handles = handlesByCreator.get(c.id) ?? [];
      const videoCount = handles.reduce((sum, h) => sum + (videosByHandle.get(h)?.size ?? 0), 0);
      return {
        id: c.id,
        real_name: c.real_name,
        brand: c.brand,
        discord_id: c.discord_id,
        status: classifyCreator(videoCount),
      };
    });

    const allowedStatuses = statusesParam
      ? new Set(statusesParam.split(',') as CreatorStatus[])
      : null;

    const finalList = allowedStatuses
      ? creatorList.filter(c => allowedStatuses.has(c.status))
      : creatorList;

    return NextResponse.json({ creators: finalList });
  } catch (err) {
    console.error('Failed to fetch creators for bulk:', err);
    return NextResponse.json({ creators: [] }, { status: 200 });
  }
}
