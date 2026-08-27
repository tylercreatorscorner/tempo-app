import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';

interface QueueEntry {
  id: string;
  matched_creator_id: number | null;
  discord_user_id: string | null;
  discord_avatar_url: string | null;
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const reviewedBy = profile.email || profile.name || profile.user_id;
  const supabase = await createAdminClient();

  const { data: entry, error: fetchErr } = await supabase
    .from('discord_match_queue')
    .select('id, matched_creator_id, discord_user_id, discord_avatar_url')
    .eq('id', id)
    .single<QueueEntry>();

  if (fetchErr || !entry) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  }

  if (!entry.matched_creator_id) {
    return NextResponse.json({ error: 'No creator matched — use reassign instead' }, { status: 400 });
  }

  const { error: updateErr } = await supabase
    .from('discord_match_queue')
    .update({ status: 'approved', reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() })
    .eq('id', id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const { error: linkErr } = await supabase
    .from('managed_creators')
    // Machine write. Labelled explicitly so the change log does not
    // attribute a Discord link to whoever last edited the creator by hand —
    // updated_by persists on the row.
    .update({
      discord_id: entry.discord_user_id,
      discord_avatar: entry.discord_avatar_url,
      updated_by: 'discord-scan',
    })
    .eq('id', entry.matched_creator_id);

  if (linkErr) {
    return NextResponse.json({ error: linkErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
