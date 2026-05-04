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

export const runtime = 'nodejs';

export async function GET() {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = await createAdminClient();
  const { data: brandsRows, error: brandsErr } = await supabase
    .from('brands_v2')
    .select('id, slug, name, color, is_archived, is_umbrella, created_at')
    .order('is_archived', { ascending: true })
    .order('name');
  if (brandsErr) return NextResponse.json({ error: brandsErr.message }, { status: 500 });

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

  return NextResponse.json({ brands });
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
