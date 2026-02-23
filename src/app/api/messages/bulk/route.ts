import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { creatorIds, content } = await request.json();

    if (!content?.trim() || !creatorIds?.length) {
      return NextResponse.json({ error: 'Content and creatorIds are required' }, { status: 400 });
    }

    const supabase = await createAdminClient();

    const rows = creatorIds.map((id: number) => ({
      creator_id: id,
      direction: 'outbound',
      channel: 'bulk',
      content: content.trim(),
      status: 'sent',
      sent_by: 'admin',
    }));

    const { error } = await supabase.from('creator_messages').insert(rows);

    if (error) throw error;

    return NextResponse.json({ queued: creatorIds.length });
  } catch (err: unknown) {
    console.error('Failed to send bulk messages:', err);
    return NextResponse.json({ error: 'Failed to send bulk messages' }, { status: 500 });
  }
}
