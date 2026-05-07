import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';

interface PendingLinkRow {
  id: string;
  discord_user_id: string | null;
  discord_username: string | null;
  discord_avatar_url: string | null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const creatorId = typeof body.creator_id === 'string' ? body.creator_id : undefined;
  const reviewedBy = profile.email || profile.name || profile.user_id;
  const autoApprove = body.auto_approve !== false; // default true

  if (!creatorId) {
    return NextResponse.json({ error: 'creator_id required' }, { status: 400 });
  }

  const supabase = await createAdminClient();

  const { data: entry, error: fetchErr } = await supabase
    .from('pending_creator_links')
    .select('id, discord_user_id, discord_username, discord_avatar_url')
    .eq('id', id)
    .single<PendingLinkRow>();

  if (fetchErr || !entry) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  }

  // Reassign the match
  const { error: reassignErr } = await supabase
    .from('pending_creator_links')
    .update({
      matched_creator_id: creatorId,
      match_type: 'manual',
      match_confidence: 1,
      match_reason: `Manually reassigned by ${reviewedBy}`,
    })
    .eq('id', id);

  if (reassignErr) {
    return NextResponse.json({ error: reassignErr.message }, { status: 500 });
  }

  if (!autoApprove) {
    return NextResponse.json({ success: true, approved: false });
  }

  // Apply the link to creators_v2 immediately (admin already chose)
  const { error: linkErr } = await supabase
    .from('creators_v2')
    .update({
      discord_id: entry.discord_user_id,
      discord_username: entry.discord_username,
      discord_avatar: entry.discord_avatar_url,
      updated_at: new Date().toISOString(),
    })
    .eq('id', creatorId);

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
    const { error: rollbackErr } = await supabase
      .from('creators_v2')
      .update({
        discord_id: null,
        discord_username: null,
        discord_avatar: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', creatorId);
    return NextResponse.json(
      {
        error: statusErr.message,
        rollback: rollbackErr ? `failed: ${rollbackErr.message}` : 'ok',
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, approved: true });
}
