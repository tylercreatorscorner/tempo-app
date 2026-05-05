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

// DELETE /api/roster/[id] — soft-remove a managed creator from the roster.
//
// Sets archived_at instead of hard-deleting. Hard delete fails because
// creator_messages and discord_match_queue have NO ACTION FKs, and would
// orphan creator_performance (SET NULL) — which is exactly the GMV history
// we want to keep for historical earnings reports.
//
// Archived creators:
//   - disappear from the roster list, renewals, and rev-share calculations
//   - keep all their performance / messaging / audit data intact
//   - can be restored by setting archived_at = NULL
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('managed_creators')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('id, real_name')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'Creator not found' }, { status: 404 });

  return NextResponse.json({ ok: true, archived: data });
}
