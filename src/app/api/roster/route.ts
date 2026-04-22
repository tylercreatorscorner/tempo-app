import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { brandSlugToUuid } from '@/lib/utils/constants';

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

const COLUMNS = [
  'id', 'real_name', 'brand', 'status', 'retainer', 'monthly_post_requirement',
  'discord_name', 'discord_avatar', 'notes', 'created_at',
  'account_1', 'account_2', 'account_3', 'account_4', 'account_5',
].join(', ');

// GET /api/roster?brand=&status=&search=&page=1&limit=50&sort=&dir=
export async function GET(request: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const brand  = searchParams.get('brand');
  const status = searchParams.get('status');
  const search = searchParams.get('search');
  const page   = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit  = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
  const offset = (page - 1) * limit;

  // Whitelist sortable columns to prevent SQL injection via arbitrary column names
  const SORTABLE = ['retainer', 'real_name', 'monthly_post_requirement', 'created_at', 'status', 'brand'] as const;
  const sortParam = searchParams.get('sort') || 'retainer';
  const dirParam  = searchParams.get('dir')  || 'desc';
  const sortCol   = (SORTABLE as readonly string[]).includes(sortParam) ? sortParam : 'retainer';
  const ascending = dirParam === 'asc';

  const supabase = await createAdminClient();

  let query = supabase
    .from('managed_creators')
    .select(COLUMNS, { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order(sortCol, { ascending, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (brand && brand !== 'all') query = query.eq('brand', brand);
  if (status && status !== 'all') query = query.eq('status', status);
  if (search) {
    query = query.or(
      `real_name.ilike.%${search}%,account_1.ilike.%${search}%,discord_name.ilike.%${search}%`
    );
  }

  const { data, count, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aggregate query: total_retainer, active_count, on_retainer_count across ALL matching rows
  let aggQuery = supabase
    .from('managed_creators')
    .select('retainer, status')
    .eq('tenant_id', tenantId);
  if (brand && brand !== 'all') aggQuery = aggQuery.eq('brand', brand);
  if (status && status !== 'all') aggQuery = aggQuery.eq('status', status);
  if (search) {
    aggQuery = aggQuery.or(
      `real_name.ilike.%${search}%,account_1.ilike.%${search}%,discord_name.ilike.%${search}%`
    );
  }
  const { data: aggRows } = await aggQuery;
  const total_retainer    = (aggRows || []).reduce((sum, r) => sum + (Number(r.retainer) || 0), 0);
  const active_count      = (aggRows || []).filter(r => r.status === 'Active').length;
  const on_retainer_count = (aggRows || []).filter(r => (Number(r.retainer) || 0) > 0).length;

  return NextResponse.json({ data, total: count ?? 0, page, limit, total_retainer, active_count, on_retainer_count });
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-provision creators_v2 + tiktok_accounts + creator_brands so
  // "View Full Profile" works immediately for newly added creators.
  const handle = data.account_1;
  if (handle) {
    const brandUuid = brand ? brandSlugToUuid(brand) : undefined;

    // 1. Check if a creators_v2 record already exists for this handle+tenant
    const { data: existing } = await supabase
      .from('tiktok_accounts')
      .select('creator_id')
      .ilike('tiktok_username', handle)
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle();

    let creatorId: string | null = existing?.creator_id ?? null;

    if (!creatorId) {
      // 2. Create creators_v2 record
      const { data: cv } = await supabase
        .from('creators_v2')
        .insert({
          tenant_id: tenantId,
          real_name: real_name || null,
          notes: notes || null,
          discord_username: discord_name || null,
        })
        .select('id')
        .single();

      creatorId = cv?.id ?? null;
    }

    if (creatorId) {
      // 3. Ensure tiktok_accounts row exists for primary handle
      await supabase
        .from('tiktok_accounts')
        .upsert({
          creator_id: creatorId,
          tenant_id: tenantId,
          tiktok_username: handle,
          brand_id: brandUuid ?? null,
          is_primary: true,
        }, { onConflict: 'tenant_id,tiktok_username,brand_id', ignoreDuplicates: true });

      // 4. Ensure creator_brands row exists
      if (brandUuid) {
        await supabase
          .from('creator_brands')
          .upsert({
            creator_id: creatorId,
            brand_id: brandUuid,
            tenant_id: tenantId,
            is_managed: true,
            status: 'active',
            retainer: retainer || 0,
            monthly_post_requirement: monthly_post_requirement || 30,
          }, { onConflict: 'creator_id,brand_id', ignoreDuplicates: true });
      }
    }
  }

  return NextResponse.json({ data }, { status: 201 });
}
