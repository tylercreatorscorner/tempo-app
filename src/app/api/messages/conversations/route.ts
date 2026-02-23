import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createAdminClient();

    // Get all messages ordered by most recent
    const { data: messages, error } = await supabase
      .from('creator_messages')
      .select('id, creator_id, discord_user_id, content, direction, sent_at, status')
      .order('sent_at', { ascending: false });

    if (error) throw error;

    // Group by discord_user_id (primary key for conversations)
    // Falls back to creator_id if no discord_user_id
    const convMap = new Map<string, {
      key: string;
      creator_id: number | null;
      discord_user_id: string | null;
      last_message: string;
      last_message_at: string;
      direction: string;
      unread_count: number;
      message_count: number;
    }>();

    for (const msg of messages ?? []) {
      const key = msg.discord_user_id || `creator:${msg.creator_id}`;
      if (!convMap.has(key)) {
        convMap.set(key, {
          key,
          creator_id: msg.creator_id,
          discord_user_id: msg.discord_user_id,
          last_message: msg.content,
          last_message_at: msg.sent_at,
          direction: msg.direction,
          unread_count: 0,
          message_count: 0,
        });
      }
      const conv = convMap.get(key)!;
      conv.message_count++;
      if (msg.direction === 'inbound') {
        conv.unread_count++;
      }
      // Keep the creator_id if we find one
      if (msg.creator_id && !conv.creator_id) {
        conv.creator_id = msg.creator_id;
      }
    }

    // Fetch creator names for linked conversations
    const creatorIds = [...convMap.values()]
      .map(c => c.creator_id)
      .filter((id): id is number => id !== null);
    
    const creatorNames: Record<number, string> = {};
    if (creatorIds.length > 0) {
      const { data: creators } = await supabase
        .from('managed_creators')
        .select('id, real_name')
        .in('id', creatorIds);
      for (const c of creators ?? []) {
        creatorNames[c.id] = c.real_name;
      }
    }

    // Try to resolve Discord usernames for unlinked conversations
    const conversations = [...convMap.values()].map(c => {
      let name = 'Unknown User';
      if (c.creator_id && creatorNames[c.creator_id]) {
        name = creatorNames[c.creator_id];
      } else if (c.discord_user_id) {
        name = `Discord User ${c.discord_user_id.slice(-4)}`;
      }

      return {
        creator_id: c.creator_id ?? 0,
        discord_user_id: c.discord_user_id,
        creator_name: name,
        last_message: c.last_message,
        last_message_at: c.last_message_at,
        direction: c.direction,
        unread_count: c.unread_count,
        message_count: c.message_count,
      };
    });

    return NextResponse.json({ conversations });
  } catch (err: unknown) {
    console.error('Failed to fetch conversations:', err);
    return NextResponse.json({ conversations: [], error: 'Failed to fetch conversations' }, { status: 200 });
  }
}
