/**
 * POST /api/invoices/[id]/refresh
 *
 * Re-pulls live earnings data for the invoice's brand+month+payee (the
 * invoice's own team_member_id) and updates the snapshot fields:
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
import { computeInvoiceLineItems } from '@/lib/finance/invoice-math';
import { upsertEarningsLedger } from '@/lib/finance/earnings-ledger';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await ctx.params;
  const supabase = await createAdminClient();

  const { data: invoice, error: fetchErr } = await supabase
    .from('invoices')
    .select('id, brand, period_month, status, team_member_id')
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

  // Recompute for the INVOICE's own payee. Omitting the id here made
  // getEarnings fall back to the DEFAULT team member, so refreshing a
  // non-default payee's invoice silently rewrote its line items with someone
  // else's compensation arrangements. null (legacy pre-team_members invoices)
  // keeps the default-payee fallback, which is what generated them.
  const earnings = await getEarnings(invoice.period_month, invoice.team_member_id ?? undefined);
  const row = earnings.brands.find((b) => b.brand === invoice.brand);
  if (!row) {
    return NextResponse.json(
      { error: `Brand "${invoice.brand}" not found in earnings for ${invoice.period_month}. May have been archived.` },
      { status: 404 },
    );
  }

  // Same shared math as generation — never sum fields off the row directly.
  const line = computeInvoiceLineItems(row);

  const update = {
    affiliate_gmv: line.affiliateGmv,
    marketing_gmv: line.marketingGmv,
    total_gmv: line.totalGmv,
    commission: line.commission,
    retainer: line.retainer,
    product_retainer: line.productRetainer,
    launch_fee: line.launchFee,
    total_amount: line.totalAmount,
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

  // Re-freeze the ledger snapshot alongside the refreshed invoice so the
  // frozen record keeps matching what the invoice now says. Warn-don't-fail:
  // the invoice update already succeeded.
  const ledgerTeamMemberId = (invoice.team_member_id as string | null) ?? earnings.teamMember?.id ?? null;
  const ledgerError = ledgerTeamMemberId
    ? await upsertEarningsLedger(supabase, {
        brandSlug: invoice.brand,
        periodMonth: invoice.period_month,
        teamMemberId: ledgerTeamMemberId,
        snapshot: row,
        invoiceId: invoice.id,
      })
    : 'no team member resolved — ledger snapshot not written';

  return NextResponse.json(ledgerError ? { invoice: updated, ledgerError } : { invoice: updated });
}
