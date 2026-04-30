/**
 * PATCH /api/earnings/marketing-gmv
 *
 * Upsert the manually-entered marketing GMV for (brand, month).
 * The marketing_gmv table is keyed by (brand, month).
 *
 * Body: { brand: string, month: 'YYYY-MM', amount: number }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';

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
  const { error } = await admin
    .from('marketing_gmv')
    .upsert(
      { brand, month, amount, updated_at: new Date().toISOString(), created_by: profile.email },
      { onConflict: 'brand,month' },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
