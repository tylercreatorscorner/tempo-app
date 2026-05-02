/**
 * POST /api/invoices/[id]/refresh
 *
 * Re-pulls live earnings data for the invoice's brand+month and updates the
 * snapshot fields:
 *   - line items (commission, retainer, product_retainer, launch_fee)
 *   - GMV totals (affiliate_gmv, marketing_gmv, total_gmv)
 *   - total_amount
 *   - creator_breakdown
 *
 * Does NOT touch user-edited fields: status, sent_at, paid_at, due_date,
 * notes, bill_to_*. Use this to pull in late upload corrections or to
 * backfill creator_breakdown on invoices created before that column existed.
 *
 * Refuses to refresh sent or paid invoices — those should be immutable.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';
import { getEarnings } from '@/lib/data/earnings';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await ctx.params;
  const supabase = await createAdminClient();

  const { data: invoice, error: fetchErr } = await supabase
    .from('invoices')
    .select('id, brand, period_month, status')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (invoice.status !== 'pending') {
    return NextResponse.json(
      { error: `Can only refresh pending invoices (this one is ${invoice.status}). Mark it pending first or create a new invoice.` },
      { status: 400 },
    );
  }

  const earnings = await getEarnings(invoice.period_month);
  const row = earnings.brands.find((b) => b.brand === invoice.brand);
  if (!row) {
    return NextResponse.json(
      { error: `Brand "${invoice.brand}" not found in earnings for ${invoice.period_month}. May have been archived.` },
      { status: 404 },
    );
  }

  const update = {
    affiliate_gmv: row.affiliateGmv,
    marketing_gmv: row.marketingGmv,
    total_gmv: row.totalGmv,
    commission: row.commission,
    retainer: row.retainer,
    product_retainer: row.productRetainer,
    launch_fee: row.launchFee,
    total_amount: row.total,
    creator_breakdown: row.creators,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error: updateErr } = await supabase
    .from('invoices')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ invoice: updated });
}
