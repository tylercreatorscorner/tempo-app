/**
 * PATCH /api/earnings/brand-settings
 *
 * Inline-edit endpoint for the earnings page's per-brand fields:
 *   commission_rate, retainer, launch_fee, product_retainer_amount
 *
 * Body: { brand: string, field: 'rate' | 'retainer' | 'launch_fee' | 'product_retainer', value: number }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const FIELD_TO_COLUMN: Record<string, string> = {
  rate:              'commission_rate',
  retainer:          'retainer',
  launch_fee:        'launch_fee',
  product_retainer:  'product_retainer_amount',
};

export async function PATCH(request: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { brand?: string; field?: string; value?: number };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { brand, field, value } = body;
  if (!brand || !field || value === undefined) {
    return NextResponse.json({ error: 'Missing brand/field/value' }, { status: 400 });
  }
  const column = FIELD_TO_COLUMN[field];
  if (!column) return NextResponse.json({ error: `Unknown field: ${field}` }, { status: 400 });
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return NextResponse.json({ error: 'Value must be a non-negative number' }, { status: 400 });
  }

  const admin = await createAdminClient();
  // brand_settings has 1 row per brand; upsert on the brand column
  const { error } = await admin
    .from('brand_settings')
    .upsert({ brand, [column]: value, updated_at: new Date().toISOString() }, { onConflict: 'brand' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
