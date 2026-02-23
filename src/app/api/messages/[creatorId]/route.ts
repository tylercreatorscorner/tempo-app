import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ creatorId: string }> }
) {
  try {
    const { creatorId } = await params;
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const discordUserId = url.searchParams.get('discord_user_id');
    const limit = 50;
    const offset = (page - 1) * limit;

    const supabase = await createAdminClient();

    // Query by discord_user_id if provided, otherwise by creator_id
    let query = supabase
      .from('creator_messages')
      .select('*', { count: 'exact' });

    if (discordUserId) {
      query = query.eq('discord_user_id', discordUserId);
    } else if (parseInt(creatorId) > 0) {
      query = query.eq('creator_id', parseInt(creatorId));
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
