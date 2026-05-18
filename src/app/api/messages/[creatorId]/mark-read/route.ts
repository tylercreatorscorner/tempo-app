import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';

// POST /api/messages/[creatorId]/mark-read
// Marks all unread inbound messages for this creator as read.
// Also accepts an optional discord_user_id so that person-level conversations
// (multiple creator_ids sharing a discord account) are all marked read at once.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ creatorId: string }> }
) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { creatorId } = await params;
  const { searchParams } = new URL(request.url);
  const discordUserId = searchParams.get('discord_user_id');

  const supabase = await createAdminClient();

  const bs = scope.brandScope;
  const isScoped = bs.kind === 'scoped';
  if (bs.kind === 'scoped') {
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

  // Mark unread inbound messages as read — match either by creator_id or by discord_user_id
  // so multi-profile creators all clear in one call
  let query = supabase
    .from('creator_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('direction', 'inbound')
    .is('read_at', null);

  if (discordUserId && !isScoped) {
    query = query.or(`creator_id.eq.${creatorId},discord_user_id.eq.${discordUserId}`);
  } else {
    query = query.eq('creator_id', creatorId);
  }

  const { error, data } = await query.select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ marked_read: data?.length ?? 0 });
}
