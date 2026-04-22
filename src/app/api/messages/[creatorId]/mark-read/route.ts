import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// POST /api/messages/[creatorId]/mark-read
// Marks all unread inbound messages for this creator as read.
// Also accepts an optional discord_user_id so that person-level conversations
// (multiple creator_ids sharing a discord account) are all marked read at once.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ creatorId: string }> }
) {
  const { creatorId } = await params;
  const { searchParams } = new URL(request.url);
  const discordUserId = searchParams.get('discord_user_id');

  const supabase = await createAdminClient();

  // Mark unread inbound messages as read — match either by creator_id or by discord_user_id
  // so multi-profile creators all clear in one call
  let query = supabase
    .from('creator_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('direction', 'inbound')
    .is('read_at', null);

  if (discordUserId) {
    query = query.or(`creator_id.eq.${creatorId},discord_user_id.eq.${discordUserId}`);
  } else {
    query = query.eq('creator_id', creatorId);
  }

  const { error, count } = await query.select('*', { count: 'exact', head: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ marked_read: count ?? 0 });
}
