import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { randomBytes } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { brand, tenant_id, created_by, max_uses = 100, expires_days = 7 } = body;

    if (!brand || !tenant_id) {
      return NextResponse.json({ error: 'brand and tenant_id are required' }, { status: 400 });
    }

    const code = randomBytes(4).toString('hex'); // 8 char hex code
    const expires_at = new Date(Date.now() + expires_days * 24 * 60 * 60 * 1000).toISOString();

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('invites')
      .insert({
        brand,
        tenant_id,
        created_by: created_by ?? 'admin',
        code,
        expires_at,
        max_uses,
        current_uses: 0,
        active: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ invite: data, join_url: `/join/${code}` });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
