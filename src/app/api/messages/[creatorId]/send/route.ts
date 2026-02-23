import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ creatorId: string }> }
) {
  try {
    const { creatorId } = await params;
    const { content } = await request.json();

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
    }

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('creator_messages')
      .insert({
        creator_id: parseInt(creatorId),
        direction: 'outbound',
        channel: 'dm',
        content: content.trim(),
        status: 'sent',
        sent_by: 'admin',
      })
      .select()
      .single();

    if (error) throw error;

    // TODO: In production, trigger Discord bot to send the actual DM
    // import { sendTrackedDM } from '@/lib/discord/relay';
    // await sendTrackedDM(discordUserId, content);

    return NextResponse.json({ message: data });
  } catch (err: unknown) {
    console.error('Failed to send message:', err);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
