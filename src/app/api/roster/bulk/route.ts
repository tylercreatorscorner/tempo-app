import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// POST /api/roster/bulk — bulk add creators from parsed CSV data
// Expects: { tenant_id, brand_id?, creators: Array<{ creator_handle, creator_name?, retainer_amount?, start_date? }> }
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { tenant_id, brand_id, creators } = body;

  if (!tenant_id || !Array.isArray(creators) || creators.length === 0) {
    return NextResponse.json({ error: 'tenant_id and creators array are required' }, { status: 400 });
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
