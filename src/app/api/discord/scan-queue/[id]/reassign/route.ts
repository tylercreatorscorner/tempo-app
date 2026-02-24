import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { creator_id, reviewed_by } = body as { creator_id: number; reviewed_by: string };
  const supabase = getSupabase();

  // Get the queue entry
  const { data: entry, error: fetchErr } = await supabase
    .from('discord_match_queue')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !entry) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  }

  // Update queue entry
  const { error: updateErr } = await supabase
    .from('discord_match_queue')
    .update({
      matched_creator_id: creator_id,
      match_type: 'fuzzy',
      match_reason: `Manually reassigned by ${reviewed_by}`,
      status: 'approved',
      reviewed_by,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Link discord ID to the specified managed_creator
  const { error: linkErr } = await supabase
    .from('managed_creators')
    .update({ discord_id: entry.discord_user_id, discord_avatar: entry.discord_avatar_url })
    .eq('id', creator_id);

  if (linkErr) {
    return NextResponse.json({ error: linkErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
