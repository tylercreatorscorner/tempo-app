import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const creatorId = parseInt(id, 10);
  if (isNaN(creatorId)) {
    return NextResponse.json({ error: 'Invalid creator ID' }, { status: 400 });
  }

  const body = await request.json();
  const { tiktok_username } = body;

  if (!tiktok_username || typeof tiktok_username !== 'string') {
    return NextResponse.json({ error: 'tiktok_username is required' }, { status: 400 });
  }

  const handle = tiktok_username.replace(/^@/, '').trim().toLowerCase();
  if (!handle) {
    return NextResponse.json({ error: 'Invalid handle' }, { status: 400 });
  }

  const supabase = await createAdminClient();

  // Check if already linked
  const { data: existing } = await supabase
    .from('creator_accounts')
    .select('id')
    .eq('creator_id', creatorId)
    .eq('tiktok_username', handle)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ error: 'Account already linked' }, { status: 409 });
  }

  const { error } = await supabase
    .from('creator_accounts')
    .insert({ creator_id: creatorId, tiktok_username: handle });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const creatorId = parseInt(id, 10);
  if (isNaN(creatorId)) {
    return NextResponse.json({ error: 'Invalid creator ID' }, { status: 400 });
  }

  const body = await request.json();
  const { tiktok_username } = body;

  if (!tiktok_username) {
    return NextResponse.json({ error: 'tiktok_username is required' }, { status: 400 });
  }

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from('creator_accounts')
    .delete()
    .eq('creator_id', creatorId)
    .eq('tiktok_username', tiktok_username);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
