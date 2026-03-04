import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// GET /api/roster?tenant_id=...&brand_id=...&status=...&search=...
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenant_id');
  const brandId = searchParams.get('brand_id');
  const status = searchParams.get('status');
  const search = searchParams.get('search');

  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 });
  }

  const supabase = await createAdminClient();

  let query = supabase
    .from('managed_roster')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (brandId) query = query.eq('brand_id', brandId);
  if (status) query = query.eq('status', status);
  if (search) {
    query = query.or(`creator_handle.ilike.%${search}%,creator_name.ilike.%${search}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

// POST /api/roster — add a single creator to the roster
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { tenant_id, brand_id, creator_handle, creator_name, retainer_amount, retainer_currency, retainer_period, start_date, end_date, status, notes } = body;

  if (!tenant_id || !creator_handle) {
    return NextResponse.json({ error: 'tenant_id and creator_handle are required' }, { status: 400 });
  }

  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('managed_roster')
    .insert({
      tenant_id,
      brand_id: brand_id || null,
      creator_handle: creator_handle.replace(/^@/, ''),
      creator_name: creator_name || null,
      retainer_amount: retainer_amount || null,
      retainer_currency: retainer_currency || 'USD',
      retainer_period: retainer_period || 'monthly',
      start_date: start_date || null,
      end_date: end_date || null,
      status: status || 'active',
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Creator already exists in roster for this brand' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
