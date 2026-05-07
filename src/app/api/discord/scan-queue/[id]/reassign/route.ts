import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';

interface QueueEntry {
  id: string;
  discord_user_id: string | null;
  discord_avatar_url: string | null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const creatorId = typeof body.creator_id === 'number' ? body.creator_id : undefined;
  const reviewedBy = profile.email || profile.name || profile.user_id;

  if (creatorId === undefined) {
    return NextResponse.json({ error: 'creator_id required' }, { status: 400 });
  }

  const supabase = await createAdminClient();

  const { data: entry, error: fetchErr } = await supabase
    .from('discord_match_queue')
    .select('id, discord_user_id, discord_avatar_url')
    .eq('id', id)
    .single<QueueEntry>();

  if (fetchErr || !entry) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  }

  const { error: updateErr } = await supabase
    .from('discord_match_queue')
    .update({
      matched_creator_id: creatorId,
      match_type: 'fuzzy',
      match_reason: `Manually reassigned by ${reviewedBy}`,
      status: 'approved',
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const { error: linkErr } = await supabase
    .from('managed_creators')
    .update({ discord_id: entry.discord_user_id, discord_avatar: entry.discord_avatar_url })
    .eq('id', creatorId);

  if (linkErr) {
    return NextResponse.json({ error: linkErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
