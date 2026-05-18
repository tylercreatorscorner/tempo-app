import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ creatorId: string }> }
) {
  try {
    const scope = await getWorkspaceScope();
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { creatorId } = await params;
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const discordUserId = url.searchParams.get('discord_user_id');
    const limit = 50;
    const offset = (page - 1) * limit;

    const supabase = await createAdminClient();

    const bs = scope.brandScope;
    const isScoped = bs.kind === 'scoped';
    if (bs.kind === 'scoped') {
      // Manager: the creator must be in their tenant + brands. The
      // discord_user_id widening (merges multiple creator_ids) is disabled
      // for scoped users so it can't surface other brands' threads.
      if (!creatorId || creatorId === '0') {
        return NextResponse.json({ messages: [], total: 0, page: 1, hasMore: false });
      }
      const { data: c } = await supabase
        .from('creators_v2').select('id')
        .eq('id', creatorId).eq('tenant_id', scope.tenantId).maybeSingle();
      const ids = bs.brandIds;
      const { data: link } = c
        ? await supabase.from('creator_brands').select('id')
            .eq('creator_id', creatorId)
            .in('brand_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
            .limit(1)
        : { data: null };
      if (!c || !link || link.length === 0) {
        return NextResponse.json({ error: 'Forbidden: creator not in your brands' }, { status: 403 });
      }
    }

    // Query by discord_user_id if provided, otherwise by creator_id
    let query = supabase
      .from('creator_messages')
      .select('*', { count: 'exact' });

    if (discordUserId && !isScoped) {
      query = query.eq('discord_user_id', discordUserId);
    } else if (creatorId && creatorId !== '0') {
      query = query.eq('creator_id', creatorId);
    } else {
      return NextResponse.json({ messages: [], total: 0, page: 1, hasMore: false });
    }

    const { data: messages, error, count } = await query
      .order('sent_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({
      messages: messages ?? [],
      total: count ?? 0,
      page,
      hasMore: (count ?? 0) > offset + limit,
    });
  } catch (err: unknown) {
    console.error('Failed to fetch messages:', err);
    return NextResponse.json({ messages: [], total: 0, page: 1, hasMore: false }, { status: 200 });
  }
}
