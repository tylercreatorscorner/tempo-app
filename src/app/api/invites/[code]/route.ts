import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  const supabase = await createAdminClient();
  const { data: invite, error } = await supabase
    .from('invites')
    .select('*')
    .eq('code', code)
    .eq('active', true)
    .single();

  if (error || !invite) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 });
  }

  // Check expiry
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invite has expired' }, { status: 410 });
  }

  // Check usage
  if (invite.current_uses >= invite.max_uses) {
    return NextResponse.json({ error: 'This invite has reached its limit' }, { status: 410 });
  }

  // Get brand display name
  const { data: brandData } = await supabase
    .from('brands')
    .select('display_name')
    .eq('name', invite.brand)
    .single();

  return NextResponse.json({
    brand: invite.brand,
    brand_display_name: brandData?.display_name ?? invite.brand,
    tenant_id: invite.tenant_id,
  });
}
