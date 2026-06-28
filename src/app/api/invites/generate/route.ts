import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { randomBytes } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    // Admin-only, and the tenant is the admin's OWN tenant — never trust a
    // tenant_id from the body (that let any caller mint invites into any tenant).
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!admin.tenant_id) return NextResponse.json({ error: 'No tenant on profile' }, { status: 400 });

    const body = await request.json();
    const { brand, max_uses = 100, expires_days = 7 } = body;

    if (!brand) {
      return NextResponse.json({ error: 'brand is required' }, { status: 400 });
    }

    const code = randomBytes(4).toString('hex'); // 8 char hex code
    const expires_at = new Date(Date.now() + expires_days * 24 * 60 * 60 * 1000).toISOString();

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('invites')
      .insert({
        brand,
        tenant_id: admin.tenant_id,
        created_by: admin.email || admin.user_id,
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
