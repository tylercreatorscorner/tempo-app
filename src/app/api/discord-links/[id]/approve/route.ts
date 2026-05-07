import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';

interface PendingLinkRow {
  id: string;
  matched_creator_id: string | null;
  discord_user_id: string | null;
  discord_username: string | null;
  discord_avatar_url: string | null;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const reviewedBy = profile.email || profile.name || profile.user_id;

  const supabase = await createAdminClient();

  const { data: entry, error: fetchErr } = await supabase
    .from('pending_creator_links')
    .select('id, matched_creator_id, discord_user_id, discord_username, discord_avatar_url')
    .eq('id', id)
    .single<PendingLinkRow>();

  if (fetchErr || !entry) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  }

  if (!entry.matched_creator_id) {
    return NextResponse.json(
      { error: 'No creator matched — use Reassign first' },
      { status: 400 },
    );
  }

  // Apply the link to creators_v2
  const { error: linkErr } = await supabase
    .from('creators_v2')
    .update({
      discord_id: entry.discord_user_id,
      discord_username: entry.discord_username,
      discord_avatar: entry.discord_avatar_url,
      updated_at: new Date().toISOString(),
    })
    .eq('id', entry.matched_creator_id);

  if (linkErr) {
    return NextResponse.json({ error: linkErr.message }, { status: 500 });
  }

  const { error: statusErr } = await supabase
    .from('pending_creator_links')
    .update({
      status: 'approved',
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (statusErr) {
    // Best-effort rollback so we don't leave creators_v2 with a discord link
    // tied to a queue entry that's still "pending". If the rollback fails,
    // surface both errors so an operator can clean up by hand.
    const { error: rollbackErr } = await supabase
      .from('creators_v2')
      .update({
        discord_id: null,
        discord_username: null,
        discord_avatar: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entry.matched_creator_id);
    return NextResponse.json(
      {
        error: statusErr.message,
        rollback: rollbackErr ? `failed: ${rollbackErr.message}` : 'ok',
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
