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

// GET /api/roster?brand=...&status=...&search=...
export async function GET(request: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const brand = searchParams.get('brand');
  const status = searchParams.get('status');
  const search = searchParams.get('search');

  const supabase = await createAdminClient();

  let query = supabase
    .from('managed_creators')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('retainer', { ascending: false, nullsFirst: false });

  if (brand && brand !== 'all') query = query.eq('brand', brand);
  if (status && status !== 'all') query = query.eq('status', status);
  if (search) {
    query = query.or(`real_name.ilike.%${search}%,account_1.ilike.%${search}%,discord_name.ilike.%${search}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

// POST /api/roster — add a single creator
export async function POST(request: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { brand, real_name, account_1, retainer, discord_name, notes, monthly_post_requirement } = body;

  if (!real_name && !account_1) {
    return NextResponse.json({ error: 'real_name or account_1 is required' }, { status: 400 });
  }

  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('managed_creators')
    .insert({
      brand: brand || null,
      real_name: real_name || null,
      account_1: account_1 ? account_1.replace(/^@/, '') : null,
      retainer: retainer || 0,
      discord_name: discord_name || null,
      notes: notes || null,
      monthly_post_requirement: monthly_post_requirement || 30,
      status: 'Active',
      employment_status: 'active',
      tenant_id: tenantId,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
