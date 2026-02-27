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

    // Query creator_brands joined with creators_v2
    let query = supabase
      .from('creator_brands')
      .select('creator_id, brand_id, creator:creators_v2(id, real_name, discord_id)');

    if (brand) {
      const { brandSlugToUuid } = await import('@/lib/utils/constants');
      const brandUuid = brandSlugToUuid(brand);
      if (brandUuid) query = query.eq('brand_id', brandUuid);
    }

    const { data: rows, error } = await query;

    // Flatten and filter
    const creators = (rows ?? [])
      .filter((r: any) => r.creator)
      .map((r: any) => ({
        id: r.creator.id,
        real_name: r.creator.real_name,
        brand: r.brand_id, // keep UUID for now
        discord_id: r.creator.discord_id,
      }));

    // Filter by discord
    const filtered = hasDiscord === 'yes'
      ? creators.filter((c: any) => c.discord_id)
      : hasDiscord === 'no'
        ? creators.filter((c: any) => !c.discord_id)
        : creators;

    if (error) throw error;

    // Parse status filters
    const allowedStatuses = statusesParam
      ? new Set(statusesParam.split(',') as CreatorStatus[])
      : null;

    const creatorList = filtered.map((c: any) => ({
      id: c.id,
      real_name: c.real_name,
      brand: c.brand,
      discord_id: c.discord_id,
      status: 'ghost' as CreatorStatus,
    }));

    const finalList = allowedStatuses
      ? creatorList.filter((c: any) => allowedStatuses.has(c.status))
      : creatorList;

    return NextResponse.json({ creators: finalList });
  } catch (err) {
    console.error('Failed to fetch creators for bulk:', err);
    return NextResponse.json({ creators: [] }, { status: 200 });
  }
}
