import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createAdminClient();

    // Get all messages grouped by creator with latest message info
    const { data: messages, error } = await supabase
      .from('creator_messages')
      .select('creator_id, discord_user_id, content, direction, sent_at, status')
      .order('sent_at', { ascending: false });

    if (error) throw error;

    // Group by creator_id and get conversation summaries
    const convMap = new Map<number, {
      creator_id: number;
      discord_user_id: string | null;
      last_message: string;
      last_message_at: string;
      direction: string;
      unread_count: number;
    }>();

    for (const msg of messages ?? []) {
      if (!convMap.has(msg.creator_id)) {
        convMap.set(msg.creator_id, {
          creator_id: msg.creator_id,
          discord_user_id: msg.discord_user_id,
          last_message: msg.content,
          last_message_at: msg.sent_at,
          direction: msg.direction,
          unread_count: 0,
        });
      }
      // Count inbound messages as "unread" (simplified — no read tracking yet)
      if (msg.direction === 'inbound') {
        const conv = convMap.get(msg.creator_id)!;
        conv.unread_count++;
      }
    }

    // Fetch creator names
    const creatorIds = [...convMap.keys()];
    let creatorNames: Record<number, string> = {};
    if (creatorIds.length > 0) {
      const { data: creators } = await supabase
        .from('managed_creators')
        .select('id, real_name')
        .in('id', creatorIds);
      for (const c of creators ?? []) {
        creatorNames[c.id] = c.real_name;
      }
    }

    const conversations = [...convMap.values()].map(c => ({
      ...c,
      creator_name: creatorNames[c.creator_id] || `Creator #${c.creator_id}`,
    }));

    return NextResponse.json({ conversations });
  } catch (err: unknown) {
    console.error('Failed to fetch conversations:', err);
    return NextResponse.json({ conversations: [], error: 'Failed to fetch conversations' }, { status: 200 });
  }
}
