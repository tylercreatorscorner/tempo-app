/**
 * /api/brands
 *
 * GET  — list authorized brands; metadata=1 omits optional financial settings
 * POST — create a new brand (brands_v2 row); brand_settings row is created
 *        lazily on first edit via the existing upsert path.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getBrandWriteAccess } from '@/lib/auth/brand-settings-access';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { can } from '@/lib/auth/permissions';
import { getFinanceAccess } from '@/lib/finance/access';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  // Shared reporting/brand pickers may read tenant-scoped metadata. Financial
  // settings additionally require finance access and unambiguous legacy slugs.
  const scope = await getWorkspaceScope();
  if (!scope?.tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const bs = scope.brandScope;
  const managerScoped = bs.kind === 'scoped';

  const supabase = await createAdminClient();
  let brandsQuery = supabase
    .from('brands_v2')
    .select('id, slug, name, display_name, color, logo_url, is_archived, is_umbrella, parent_brand_id, created_at', { count: 'exact' })
    .eq('tenant_id', scope.tenantId)
    .order('is_archived', { ascending: true })
    .order('name');
  if (bs.kind === 'scoped') {
    const ids = bs.brandIds;
    brandsQuery = brandsQuery.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  }
  const { data: brandsRows, error: brandsErr, count } = await brandsQuery;
  if (brandsErr) return NextResponse.json({ error: brandsErr.message }, { status: 500 });
  if (!brandsRows || count !== brandsRows.length) return NextResponse.json({ error: 'The complete brand list could not be loaded.' }, { status: 503 });

  // Pickers need only authorized metadata. Optional billing availability must
  // not block their brand choices; default finance consumers retain all guards.
  const metadataOnly = req?.nextUrl.searchParams.get('metadata') === '1';
  if (metadataOnly || managerScoped || !can(scope, 'earnings', 'read')) {
    const brands = (brandsRows ?? []).map((b) => ({ ...b, settings: null }));
    return NextResponse.json({ brands, scoped: managerScoped, financeAvailable: false });
  }

  const finance = await getFinanceAccess('earnings', 'read');
  if (finance instanceof NextResponse) return finance;
  const slugs = brandsRows.map((b: { slug: string }) => b.slug).filter(slug => finance.brandSlugs.includes(slug));
  const { data: settingsRows, error: settingsError } = await supabase
    .from('brand_settings')
    .select('*')
    .in('brand', slugs);
  if (settingsError) return NextResponse.json({ error: 'Brand billing settings could not be loaded.' }, { status: 503 });

  const settingsBySlug = new Map<string, Record<string, unknown>>();
  for (const s of (settingsRows as Array<Record<string, unknown> & { brand: string }> | null) ?? []) {
    settingsBySlug.set(s.brand, s);
  }

  const brands = (brandsRows ?? []).map((b) => ({
    ...b,
    settings: settingsBySlug.get(b.slug) ?? null,
  }));

  return NextResponse.json({ brands, scoped: false, financeAvailable: true });
}

interface PostBody {
  slug?: unknown;
  name?: unknown;
  color?: unknown;
}

export async function POST(req: NextRequest) {
  const scope = await getBrandWriteAccess();
  if (scope instanceof NextResponse) return scope;

  let body: PostBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const color = typeof body.color === 'string' && body.color ? body.color : null;

  if (!slug || !/^[a-z0-9_]+$/.test(slug)) {
    return NextResponse.json({ error: 'slug must be lowercase letters/numbers/underscores only' }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('brands_v2')
    .insert({
      slug,
      name,
      color,
      tenant_id: scope.tenantId,
      is_archived: false,
      is_umbrella: false,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505' || /duplicate/i.test(error.message)) {
      return NextResponse.json({ error: `A brand with slug "${slug}" already exists.` }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ brand: data }, { status: 201 });
}
