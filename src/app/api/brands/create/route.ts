import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's tenant and verify they're an owner/admin
    const admin = await createAdminClient();
    const { data: profile } = await admin
      .from('user_profiles')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .single();

    if (!profile || !['owner', 'admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { name, slug, color } = await request.json();

    if (!name || !slug) {
      return NextResponse.json({ error: 'Name and slug are required' }, { status: 400 });
    }

    // Check tenant brand limit
    const { data: tenant } = await admin
      .from('tenants')
      .select('max_brands')
      .eq('id', profile.tenant_id)
      .single();

    const { count: currentBrands } = await admin
      .from('brands')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', profile.tenant_id);

    if (tenant && currentBrands !== null && currentBrands >= (tenant.max_brands || 1)) {
      return NextResponse.json({
        error: `Brand limit reached (${tenant.max_brands}). Upgrade your plan to add more brands.`,
      }, { status: 403 });
    }

    // Create brand
    const brandSlug = slug.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

    const { data: brand, error: brandError } = await admin
      .from('brands')
      .insert({
        name,
        brand_key: brandSlug,
        color: color || '#FF4D8D',
        tenant_id: profile.tenant_id,
        is_active: true,
      })
      .select()
      .single();

    if (brandError) {
      if (brandError.code === '23505') {
        return NextResponse.json({ error: 'A brand with this slug already exists' }, { status: 409 });
      }
      console.error('Brand creation error:', brandError);
      return NextResponse.json({ error: brandError.message }, { status: 500 });
    }

    return NextResponse.json({ brand });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('Create brand error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
