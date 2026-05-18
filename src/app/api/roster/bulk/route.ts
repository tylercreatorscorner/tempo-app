import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/require-admin';

// POST /api/roster/bulk — bulk add creators from parsed CSV data.
// Owner/admin only (bulk CSV import is an admin operation; managers add
// single creators via the brand-scoped /api/roster). tenant_id is taken
// from the authenticated profile — NEVER from the request body.
// Expects: { brand_id?, creators: Array<{ creator_handle, creator_name?, retainer_amount?, start_date? }> }
export async function POST(request: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const tenant_id = profile.tenant_id;
  if (!tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 });

  const body = await request.json();
  const { brand_id, creators } = body;

  if (!Array.isArray(creators) || creators.length === 0) {
    return NextResponse.json({ error: 'creators array is required' }, { status: 400 });
  }

  if (creators.length > 500) {
    return NextResponse.json({ error: 'Maximum 500 creators per bulk upload' }, { status: 400 });
  }

  const rows = creators.map((c: Record<string, unknown>) => ({
    tenant_id,
    brand_id: brand_id || null,
    creator_handle: String(c.creator_handle || '').replace(/^@/, ''),
    creator_name: c.creator_name || null,
    retainer_amount: c.retainer_amount ? Number(c.retainer_amount) : null,
    retainer_currency: 'USD',
    retainer_period: 'monthly',
    start_date: c.start_date || null,
    status: 'active',
  }));

  // Filter out rows with empty handles
  const validRows = rows.filter((r) => r.creator_handle.length > 0);

  if (validRows.length === 0) {
    return NextResponse.json({ error: 'No valid creator handles found' }, { status: 400 });
  }

  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('managed_roster')
    .upsert(validRows, { onConflict: 'tenant_id,brand_id,creator_handle', ignoreDuplicates: true })
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data,
    inserted: data?.length ?? 0,
    total: validRows.length,
  }, { status: 201 });
}
