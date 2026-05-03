/**
 * PATCH /api/earnings/brand-settings
 *
 * Update one or more fields on brand_settings for a brand.
 *
 * Body shape:
 *   { brand: string, patch: { [field]: value, ... } }
 *
 * Allowed fields:
 *   commission_rate              number  (percent, e.g. 5 for 5%)
 *   retainer                     number  (USD)
 *   launch_fee                   number  (USD)
 *   launch_fee_name              string|null
 *   launch_fee_ends              string|null  (YYYY-MM-DD)
 *   product_retainer_amount      number  (USD)
 *   product_retainer_name        string|null
 *   monthly_gmv_goal             number  (USD)
 *   marketing_commission_rate    number  (decimal, e.g. 0.02 for 2%)
 *   compensation_model           'standard' | 'revshare_max' | 'commission_only' | 'retainer_only'
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const NUMERIC_FIELDS = new Set([
  'commission_rate',
  'retainer',
  'launch_fee',
  'product_retainer_amount',
  'monthly_gmv_goal',
  'marketing_commission_rate',
]);

const STRING_OR_NULL_FIELDS = new Set([
  'launch_fee_name',
  'launch_fee_ends',
  'product_retainer_name',
  'bill_to_name',
  'bill_to_email',
  'bill_to_address',
  'payment_instructions',
]);

const ENUM_FIELD = 'compensation_model';
const COMPENSATION_MODELS = new Set(['standard', 'revshare_max', 'commission_only', 'retainer_only']);

export async function PATCH(request: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { brand?: string; patch?: Record<string, unknown> };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { brand, patch } = body;
  if (!brand || typeof brand !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid brand' }, { status: 400 });
  }
  if (!patch || typeof patch !== 'object') {
    return NextResponse.json({ error: 'Missing patch object' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  for (const [field, raw] of Object.entries(patch)) {
    if (NUMERIC_FIELDS.has(field)) {
      const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: `${field} must be a non-negative number` }, { status: 400 });
      }
      update[field] = n;
    } else if (STRING_OR_NULL_FIELDS.has(field)) {
      if (raw === null || raw === '') {
        update[field] = null;
      } else if (typeof raw === 'string') {
        update[field] = raw;
      } else {
        return NextResponse.json({ error: `${field} must be a string or null` }, { status: 400 });
      }
    } else if (field === ENUM_FIELD) {
      if (typeof raw !== 'string' || !COMPENSATION_MODELS.has(raw)) {
        return NextResponse.json({ error: `${field} must be one of ${[...COMPENSATION_MODELS].join(', ')}` }, { status: 400 });
      }
      update[field] = raw;
    } else {
      return NextResponse.json({ error: `Field "${field}" is not editable` }, { status: 400 });
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  update.updated_at = new Date().toISOString();

  const admin = await createAdminClient();
  const { error } = await admin
    .from('brand_settings')
    .upsert({ brand, ...update }, { onConflict: 'brand' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
