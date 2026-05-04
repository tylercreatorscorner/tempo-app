import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const creatorId = body.creator_id as string | undefined;
  const reviewedBy = (body.reviewed_by as string | undefined) ?? 'admin';
  const autoApprove = body.auto_approve !== false; // default true

  if (!creatorId) {
    return NextResponse.json({ error: 'creator_id required' }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: entry, error: fetchErr } = await supabase
    .from('pending_creator_links')
    .select('*')
    .eq('id', id)
    .single();

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
    return NextResponse.json({ error: statusErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, approved: true });
}
