import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { classifyCreator } from '@/lib/data/creator-status';
import { STATUS_CONFIG } from '@/lib/data/creator-status';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ creatorId: string }> }
) {
  try {
    const { creatorId } = await params;
    const supabase = await createAdminClient();

    // Get creator info
    const { data: creator, error } = await supabase
      .from('managed_creators')
      .select('id, real_name, brand, discord_id, retainer, discord_avatar')
      .eq('id', parseInt(creatorId))
      .single();

    if (error || !creator) {
      return NextResponse.json({ creator: null });
    }

    // Get TikTok handle from creator_accounts
    const { data: account } = await supabase
      .from('creator_accounts')
      .select('tiktok_username')
      .eq('creator_id', creator.id)
      .limit(1)
      .single();

    const tiktokHandle = account?.tiktok_username || null;

    // Get performance data (last 7 days) using creator_accounts to match
    let posts7d = 0;
    let gmv7d = 0;
    let lastActive: string | null = null;
    const brandBreakdown: Array<{ brand: string; posts_7d: number; gmv_7d: number }> = [];

    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const dateStr = sevenDaysAgo.toISOString().split('T')[0];

      // Get all tiktok usernames for this creator, grouped by brand
      const { data: allAccounts } = await supabase
        .from('creator_accounts')
        .select('tiktok_username, brand')
        .eq('creator_id', creator.id);

      const usernames = (allAccounts ?? []).map(a => a.tiktok_username);
      // Map username → brand for breakdown
      const usernameToBrand: Record<string, string> = {};
      for (const a of allAccounts ?? []) {
        usernameToBrand[a.tiktok_username.toLowerCase()] = a.brand;
      }

      if (usernames.length > 0) {
        // GMV from video_performance (report_date = when sales happened)
        const { data: salesRows } = await supabase
          .from('video_performance')
          .select('video_id, gmv, report_date, creator_name, brand')
          .in('creator_name', usernames)
          .gte('report_date', dateStr)
          .order('report_date', { ascending: false });

        if (salesRows && salesRows.length > 0) {
          gmv7d = salesRows.reduce((sum: number, v: { gmv: number | null }) => sum + (Number(v.gmv) || 0), 0);
          lastActive = salesRows[0].report_date;

          // Per-brand GMV
          const brandGmvMap = new Map<string, number>();
          for (const v of salesRows) {
            const b = v.brand || usernameToBrand[v.creator_name?.toLowerCase()] || 'unknown';
            brandGmvMap.set(b, (brandGmvMap.get(b) || 0) + (Number(v.gmv) || 0));
          }

          // Post counts from videos table (post_date = when actually posted)
          // videos table has reliable post_date; video_performance has 56% NULL
          const { data: postRows } = await supabase
            .from('videos')
            .select('video_id, creator_name, brand')
            .in('creator_name', usernames)
            .gte('post_date', dateStr);

          const allPosts = new Set<string>();
          const brandPostMap = new Map<string, Set<string>>();
          for (const v of postRows ?? []) {
            allPosts.add(v.video_id);
            const b = v.brand || usernameToBrand[v.creator_name?.toLowerCase()] || 'unknown';
            if (!brandPostMap.has(b)) brandPostMap.set(b, new Set());
            brandPostMap.get(b)!.add(v.video_id);
          }
          posts7d = allPosts.size;

          // Combine into brand breakdown
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
        brand: creator.brand,
        discord_id: creator.discord_id,
        retainer_amount: creator.retainer != null ? Number(creator.retainer) : null,
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
