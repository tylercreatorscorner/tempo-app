/**
 * /api/brands/[id]
 *
 * PATCH — mutate an existing brands_v2 row. Only a small whitelist of fields
 * is editable here (name, display_name, color, is_archived, is_umbrella).
 * Financial fields live in brand_settings + brand_compensation and are edited
 * through /api/earnings/brand-settings.
 *
 * Archiving is soft-delete: setting is_archived = true hides the brand from
 * active lists across the app (earnings, invoicing, brand portal, etc.) while
 * preserving historical data. Unarchive by PATCHing is_archived = false.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

interface PatchBody {
  name?: unknown;
  display_name?: unknown;
  color?: unknown;
  is_archived?: unknown;
  is_umbrella?: unknown;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'Missing brand id' }, { status: 400 });

  let body: PatchBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const patch: Record<string, unknown> = {};

  if ('name' in body) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
    }
    patch.name = body.name.trim();
  }
  if ('display_name' in body) {
    if (body.display_name === null || body.display_name === '') patch.display_name = null;
    else if (typeof body.display_name === 'string') patch.display_name = body.display_name.trim();
    else return NextResponse.json({ error: 'display_name must be string or null' }, { status: 400 });
  }
  if ('color' in body) {
    if (body.color === null || body.color === '') patch.color = null;
    else if (typeof body.color === 'string') patch.color = body.color;
    else return NextResponse.json({ error: 'color must be string or null' }, { status: 400 });
  }
  if ('is_archived' in body) {
    if (typeof body.is_archived !== 'boolean') {
      return NextResponse.json({ error: 'is_archived must be boolean' }, { status: 400 });
    }
    patch.is_archived = body.is_archived;
  }
  if ('is_umbrella' in body) {
    if (typeof body.is_umbrella !== 'boolean') {
      return NextResponse.json({ error: 'is_umbrella must be boolean' }, { status: 400 });
    }
    patch.is_umbrella = body.is_umbrella;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No editable fields in patch' }, { status: 400 });
  }

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('brands_v2')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ brand: data });
}
