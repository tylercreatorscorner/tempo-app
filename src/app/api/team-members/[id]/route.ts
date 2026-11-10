/**
 * /api/team-members/[id]
 *
 * PATCH  — update name / email / address / payment instructions
 * DELETE — soft-archive (sets is_archived=true). Their historical invoices
 *          and compensation rows stay intact; they just stop appearing in
 *          pickers and their arrangements stop counting toward earnings.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getBillingIdentityAccess } from '@/lib/auth/billing-identity-access';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const ALLOWED = ['name', 'email', 'address', 'payment_instructions'] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await getBillingIdentityAccess('configure');
  if (scope instanceof NextResponse) return scope;

  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const updates: Record<string, unknown> = {};
  for (const k of ALLOWED) {
    if (k in body) updates[k] = body[k] ?? null;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('team_members')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Billing identity not found' }, { status: 404 });
  return NextResponse.json({ teamMember: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await getBillingIdentityAccess('configure');
  if (scope instanceof NextResponse) return scope;

  const { id } = await params;
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('team_members')
    .update({ is_archived: true, archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .select('id')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Billing identity not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
