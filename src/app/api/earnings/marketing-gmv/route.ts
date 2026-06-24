/**
 * PATCH /api/earnings/marketing-gmv
 *
 * Upsert the manually-entered marketing GMV for a brand + month.
 *
 * Accepts a ROSTER brand slug (e.g. 'leefar') and expands it to its data-store
 * slugs server-side. marketing_gmv is keyed per store, and the earnings calc
 * reads the stores (leefar_nutrition / leefar_supplements / …), never the
 * umbrella — so the single amount the user types is parked on the first store
 * and the rest zeroed. A non-umbrella brand expands to just itself.
 *
 * Body: { brand: string, month: 'YYYY-MM', amount: number }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';
import { getBrandRegistry, expandSlugs } from '@/lib/data/brand-registry';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { brand?: string; month?: string; amount?: number };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { brand, month, amount } = body;
  if (!brand || !month || amount === undefined) {
    return NextResponse.json({ error: 'Missing brand/month/amount' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }
  if (typeof amount !== 'number' || Number.isNaN(amount) || amount < 0) {
    return NextResponse.json({ error: 'amount must be a non-negative number' }, { status: 400 });
  }

  const admin = await createAdminClient();
  const reg = await getBrandRegistry();

  // Park the whole amount on the first store slug, zero the rest (the earnings
  // calc sums the stores back into the single umbrella figure).
  const now = new Date().toISOString();
  const rows = expandSlugs(reg, brand).map((slug, i) => ({
    brand: slug,
    month,
    amount: i === 0 ? amount : 0,
    updated_at: now,
    created_by: profile.email,
  }));

  const { error } = await admin
    .from('marketing_gmv')
    .upsert(rows, { onConflict: 'brand,month' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
