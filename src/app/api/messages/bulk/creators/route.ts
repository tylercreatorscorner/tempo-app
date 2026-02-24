import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { classifyCreator, type CreatorStatus } from '@/lib/data/creator-status';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const brand = url.searchParams.get('brand');
    const statusesParam = url.searchParams.get('statuses');
    const hasDiscord = url.searchParams.get('has_discord');

    const supabase = await createAdminClient();

    let query = supabase
      .from('managed_creators')
      .select('id, real_name, brand, discord_id, tiktok_handle');

    if (brand) {
      query = query.eq('brand', brand);
    }

    if (hasDiscord === 'yes') {
      query = query.not('discord_id', 'is', null);
    } else if (hasDiscord === 'no') {
      query = query.is('discord_id', null);
    }

    const { data: creators, error } = await query.order('real_name');

    if (error) throw error;

    // Parse status filters
    const allowedStatuses = statusesParam
      ? new Set(statusesParam.split(',') as CreatorStatus[])
      : null;

    // For now we classify without actual post data (would need video_performance join)
    // We'll attempt to get post counts for classification
    const creatorList = (creators ?? []).map(c => {
      // Default to ghost since we don't have per-creator post counts in this endpoint
      // A more complete implementation would join video_performance
      return {
        id: c.id,
        real_name: c.real_name,
        brand: c.brand,
        discord_id: c.discord_id,
        status: 'ghost' as CreatorStatus,
      };
    });

    // Filter by status if specified
    const filtered = allowedStatuses
      ? creatorList.filter(c => allowedStatuses.has(c.status))
      : creatorList;

    return NextResponse.json({ creators: filtered });
  } catch (err) {
    console.error('Failed to fetch creators for bulk:', err);
    return NextResponse.json({ creators: [] }, { status: 200 });
  }
}
