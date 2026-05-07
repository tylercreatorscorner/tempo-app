import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const reviewedBy = profile.email || profile.name || profile.user_id;
  const supabase = await createAdminClient();

  const { error } = await supabase
    .from('discord_match_queue')
    .update({ status: 'rejected', reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
