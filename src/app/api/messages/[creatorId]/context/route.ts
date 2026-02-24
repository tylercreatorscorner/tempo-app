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
      .select('id, real_name, tiktok_handle, brand, discord_id, retainer_amount')
      .eq('id', parseInt(creatorId))
      .single();

    if (error || !creator) {
      return NextResponse.json({ creator: null });
    }

    // Try to get performance data (last 7 days)
    let posts7d = 0;
    let gmv7d = 0;
    let lastActive: string | null = null;

    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Try video_performance table first, fall back to creator_performance
      const { data: videos } = await supabase
        .from('video_performance')
        .select('gmv, created_at')
        .eq('creator_id', creator.id)
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      if (videos && videos.length > 0) {
        posts7d = videos.length;
        gmv7d = videos.reduce((sum: number, v: { gmv: number | null }) => sum + (v.gmv || 0), 0);
        lastActive = videos[0].created_at;
      }
    } catch {
      // Performance tables may not exist
    }

    const status = classifyCreator(posts7d);

    return NextResponse.json({
      creator: {
        id: creator.id,
        real_name: creator.real_name,
        tiktok_handle: creator.tiktok_handle,
        brand: creator.brand,
        discord_id: creator.discord_id,
        retainer_amount: creator.retainer_amount,
        status,
        status_label: STATUS_CONFIG[status].label,
        posts_7d: posts7d,
        gmv_7d: Math.round(gmv7d * 100) / 100,
        last_active: lastActive,
      },
    });
  } catch (err) {
    console.error('Failed to fetch creator context:', err);
    return NextResponse.json({ creator: null }, { status: 200 });
  }
}
