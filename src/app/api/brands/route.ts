/**
 * /api/brands
 *
 * GET  — list all brands (active + archived) with their financial settings
 * POST — create a new brand (brands_v2 row); brand_settings row is created
 *        lazily on first edit via the existing upsert path.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';

export const runtime = 'nodejs';

export async function GET() {
  // Any Workspace user may list brands they can see (managers need this for
  // the reporting/brand pickers). owner/admin/viewer → all brands + financial
  // settings; manager → only their user_brand_access brands, and NO financial
  // settings (brand_settings is finance — owner/admin only).
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const bs = scope.brandScope;
  const managerScoped = bs.kind === 'scoped';

  const supabase = await createAdminClient();
  let brandsQuery = supabase
    .from('brands_v2')
    .select('id, slug, name, display_name, color, is_archived, is_umbrella, parent_brand_id, created_at')
    .order('is_archived', { ascending: true })
    .order('name');
  if (bs.kind === 'scoped') {
    const ids = bs.brandIds;
    brandsQuery = brandsQuery.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  }
  const { data: brandsRows, error: brandsErr } = await brandsQuery;
  if (brandsErr) return NextResponse.json({ error: brandsErr.message }, { status: 500 });

  // Managers never get financial settings.
  if (managerScoped) {
    const brands = (brandsRows ?? []).map((b) => ({ ...b, settings: null }));
    return NextResponse.json({ brands, scoped: true });
  }

  const slugs = (brandsRows ?? []).map((b: { slug: string }) => b.slug);
  const { data: settingsRows } = await supabase
    .from('brand_settings')
    .select('*')
    .in('brand', slugs);

  const settingsBySlug = new Map<string, Record<string, unknown>>();
  for (const s of (settingsRows as Array<Record<string, unknown> & { brand: string }> | null) ?? []) {
    settingsBySlug.set(s.brand, s);
  }

  const brands = (brandsRows ?? []).map((b) => ({
    ...b,
    settings: settingsBySlug.get(b.slug) ?? null,
  }));

  return NextResponse.json({ brands, scoped: false });
}

interface PostBody {
  slug?: unknown;
  name?: unknown;
  color?: unknown;
}

export async function POST(req: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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
  if (!profile.tenant_id) {
    return NextResponse.json({ error: 'No tenant on your profile — cannot create brand' }, { status: 400 });
  }

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('brands_v2')
    .insert({
      slug,
      name,
      color,
      tenant_id: profile.tenant_id,
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
