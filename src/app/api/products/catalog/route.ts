import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getBrandRegistry, slugToUuid } from '@/lib/data/brand-registry';

/**
 * Product catalog admin — CRUD over the `products` table (per-brand product
 * definitions). A "product" is a friendly display_name mapped to the brand's
 * real TikTok SKUs (product_ids) + optional name keywords. These power the
 * roster's product tags and, via the product_ids, future per-product GMV.
 *
 * Owner/admin only. `product_key` is GLOBALLY unique, so we brand-prefix it.
 */

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

// GET /api/products/catalog?brand=slug → { products, skus }
export async function GET(request: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const tenantId = profile.tenant_id;

  const brand = new URL(request.url).searchParams.get('brand');
  if (!brand) return NextResponse.json({ error: 'brand is required' }, { status: 400 });

  const supabase = await createAdminClient();
  const reg = await getBrandRegistry();
  const brandUuid = slugToUuid(reg, brand);

  const [productsRes, skusRes] = await Promise.all([
    supabase.from('products').select('*').eq('brand', brand).order('display_name'),
    brandUuid
      ? supabase.rpc('get_brand_product_skus', { p_brand_id: brandUuid })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (productsRes.error) return NextResponse.json({ error: productsRes.error.message }, { status: 500 });

  return NextResponse.json({
    products: productsRes.data ?? [],
    skus: (skusRes.data ?? []) as { product_id: string; product_name: string; gmv: number; posts: number }[],
    tenantId,
  });
}

// POST /api/products/catalog  { brand, display_name, product_ids?, keywords? }
export async function POST(request: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const tenantId = profile.tenant_id;

  const body = await request.json().catch(() => null);
  const brand = String(body?.brand ?? '').trim();
  const displayName = String(body?.display_name ?? '').trim();
  if (!brand) return NextResponse.json({ error: 'brand is required' }, { status: 400 });
  if (!displayName) return NextResponse.json({ error: 'A product name is required' }, { status: 400 });

  const productIds: string[] = Array.isArray(body?.product_ids) ? body.product_ids.map(String) : [];
  const keywords: string[] = Array.isArray(body?.keywords) ? body.keywords.map(String).filter(Boolean) : [];

  const supabase = await createAdminClient();

  // Generate a globally-unique product_key (brand-prefixed slug, +N on clash).
  const base = `${brand}__${slugify(displayName) || 'product'}`;
  let key = base;
  const { data: existing } = await supabase
    .from('products').select('product_key').like('product_key', `${base}%`);
  const taken = new Set(((existing ?? []) as { product_key: string }[]).map((r) => r.product_key));
  for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;

  const { data, error } = await supabase
    .from('products')
    .insert({
      brand,
      product_key: key,
      display_name: displayName,
      product_ids: productIds,
      keywords,
      status: 'active',
      tenant_id: tenantId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product: data }, { status: 201 });
}

// PATCH /api/products/catalog  { id, display_name?, product_ids?, keywords?, status? }
export async function PATCH(request: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const id = String(body?.id ?? '');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.display_name === 'string') patch.display_name = body.display_name.trim();
  if (Array.isArray(body.product_ids)) patch.product_ids = body.product_ids.map(String);
  if (Array.isArray(body.keywords)) patch.keywords = body.keywords.map(String).filter(Boolean);
  if (body.status === 'active' || body.status === 'archived') patch.status = body.status;

  const supabase = await createAdminClient();
  const { data, error } = await supabase.from('products').update(patch).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product: data });
}

// DELETE /api/products/catalog?id=...  → soft-archive (keeps creator tags intact)
export async function DELETE(request: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from('products')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
