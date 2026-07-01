import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { getBrandRegistry, slugToUuid } from '@/lib/data/brand-registry';
import type { SegmentFilterCriteria } from '@/lib/data/segments';

export const runtime = 'nodejs';

// GET /api/segments — the caller's active custom segments (scope-aware).
export async function GET() {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = await createAdminClient();
  let query = admin
    .from('segments')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false });

  // Managers see only segments for their assigned brands, or ones they created.
  if (scope.brandScope.kind === 'scoped') {
    const ids = scope.brandScope.brandIds;
    const inList = ids.length ? ids.join(',') : '00000000-0000-0000-0000-000000000000';
    query = query.or(`brand_id.in.(${inList}),created_by.eq.${scope.userId}`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ segments: data ?? [] });
}

// POST /api/segments — save the current roster filters as a custom segment.
export async function POST(req: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { name?: unknown; description?: unknown; filter_criteria?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const criteria = (body.filter_criteria && typeof body.filter_criteria === 'object'
    ? body.filter_criteria : {}) as SegmentFilterCriteria;

  // The segment's brand comes from the criteria (null = all of the caller's brands).
  const brandSlug = criteria.brand && criteria.brand !== 'all' ? criteria.brand : null;
  if (scope.brandScope.kind === 'scoped' && brandSlug && !scope.brandScope.brandSlugs.includes(brandSlug)) {
    return NextResponse.json({ error: 'Forbidden: brand not in your access' }, { status: 403 });
  }
  const reg = await getBrandRegistry();
  const brandId = brandSlug ? slugToUuid(reg, brandSlug) ?? null : null;

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from('segments')
    .insert({
      tenant_id: scope.tenantId,
      brand_id: brandId,
      name,
      description: typeof body.description === 'string' && body.description ? body.description : null,
      kind: 'custom',
      filter_criteria: criteria,
      created_by: scope.userId,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505' || /duplicate/i.test(error.message)) {
      return NextResponse.json({ error: `A segment named "${name}" already exists for this brand.` }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ segment: data }, { status: 201 });
}
