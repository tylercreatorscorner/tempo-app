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
  const reviewedBy = (body.reviewed_by as string | undefined) ?? 'admin';

  const supabase = getSupabase();

  const { data: entry, error: fetchErr } = await supabase
    .from('pending_creator_links')
    .select('*')
    .eq('id', id)
    .single();

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
    return NextResponse.json({ error: statusErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
