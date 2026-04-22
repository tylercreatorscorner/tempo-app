import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

async function getTenantId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = await createAdminClient();
  const { data: profile } = await admin
    .from('user_profiles')
    .select('tenant_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return profile?.tenant_id || null;
}

// PATCH /api/roster/[id] — update a managed creator
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  // Whitelist of editable fields
  const ALLOWED = [
    'real_name', 'brand', 'status', 'retainer', 'monthly_post_requirement',
    'discord_name', 'notes',
    'account_1', 'account_2', 'account_3', 'account_4', 'account_5',
  ];

  const updates: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (!(key in body)) continue;
    // Strip @ prefix from handle fields, empty string → null
    if (key.startsWith('account_')) {
      const v = typeof body[key] === 'string' ? body[key].replace(/^@/, '').trim() : '';
      updates[key] = v || null;
    } else {
      updates[key] = body[key] ?? null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('managed_creators')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', tenantId) // tenant-scoped — never touch another tenant's row
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
