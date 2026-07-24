/**
 * createInvoiceForBrand — the single invoice-generation core.
 *
 * Lifted verbatim from POST /api/invoices (earnings row lookup → duplicate
 * check → computeInvoiceLineItems → collision-proof number-retry insert →
 * earnings-ledger freeze) so the single-brand button and the monthly run
 * (POST /api/invoices/run) execute the exact same path and can never drift.
 *
 * The run passes a pre-computed `earnings` result (one getEarnings call for
 * the whole month+payee) so N brands don't recompute earnings N times; the
 * single-brand path omits it and the function computes earnings itself,
 * brand-scoped for managers via `scopedSlugs`.
 *
 * No Next.js imports — callers map the returned `status` to their transport.
 * Takes the ADMIN client as an argument (invoices + earnings_ledger are
 * service-role-only), so a future cron caller can supply its own.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getEarnings, type EarningsResult } from '@/lib/data/earnings';
import { computeInvoiceLineItems } from '@/lib/finance/invoice-math';
import { upsertEarningsLedger } from '@/lib/finance/earnings-ledger';
import { DEFAULT_PAYMENT_INSTRUCTIONS } from '@/lib/invoices/defaults';

export interface CreateInvoiceForBrandArgs {
  brand: string;
  /** YYYY-MM — validated by the caller. */
  month: string;
  /** Requested payee. Ignored when `earnings` is supplied (the result already
   *  carries its resolved payee). Undefined → getEarnings' default payee. */
  teamMemberId?: string | null;
  /** Pre-computed earnings for this month+payee — the run passes ONE result
   *  for all its brands. When omitted the function computes it. */
  earnings?: EarningsResult;
  /** Manager brand scope for the fallback getEarnings call (null = all). */
  scopedSlugs?: string[] | null;
  /** Service-role client — invoices + earnings_ledger are admin-only tables. */
  adminClient: SupabaseClient;
  /** Attribution for invoices.created_by. */
  createdBy?: string | null;
}

export type CreateInvoiceOutcome =
  | {
      ok: true;
      status: 201;
      /** The full created invoices row (POST /api/invoices returns it verbatim). */
      invoice: Record<string, unknown>;
      invoiceId: string;
      invoiceNumber: string;
      /** Non-fatal: the invoice exists but the ledger freeze failed. */
      ledgerError?: string;
    }
  | {
      ok: false;
      status: 400 | 404 | 409 | 500;
      error: string;
      /** True for both the pre-check duplicate and the insert-race duplicate. */
      duplicate?: boolean;
      /** Set on the pre-check duplicate only (the race loser has no row to hand back). */
      existing?: { id: string; invoice_number: string; status: string };
    };

const MAX_NUMBER_ATTEMPTS = 5;

export async function createInvoiceForBrand(args: CreateInvoiceForBrandArgs): Promise<CreateInvoiceOutcome> {
  const { brand, month, adminClient: supabase } = args;

  // Compute earnings for THIS team member's compensation arrangements unless
  // the caller already did (brand-scoped for managers so cross-brand earnings
  // can't leak in).
  const earnings = args.earnings
    ?? await getEarnings(month, args.teamMemberId ?? undefined, args.scopedSlugs ?? null);
  const teamMemberId = earnings.teamMember?.id ?? null;
  if (!teamMemberId) {
    return { ok: false, status: 400, error: 'No team member configured — add one in Settings → Team Members' };
  }

  const row = earnings.brands.find((b) => b.brand === brand);
  if (!row) {
    return { ok: false, status: 404, error: `Brand "${brand}" not found in earnings for ${month}` };
  }

  // Reject if an invoice already exists for this (brand, period, team_member).
  // The unique index allows different team members to invoice the same brand
  // for the same month — which is the whole point. NULL-payee legacy invoices
  // count as existing too: .eq never matches NULL and the unique index treats
  // NULLs as distinct, so without this a legacy-invoiced month rendered
  // "Ready to invoice" and could be double-invoiced (adversarial-review
  // finding — prod has 6 such rows, and 2026-04 already carries real dupes).
  const { data: existingRows } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, team_member_id')
    .eq('brand', brand)
    .eq('period_month', month)
    .or(`team_member_id.eq.${teamMemberId},team_member_id.is.null`)
    .order('team_member_id', { ascending: true, nullsFirst: false })
    .limit(1);
  const existing = existingRows?.[0] ?? null;
  if (existing) {
    return {
      ok: false,
      status: 409,
      error: `Invoice already exists for ${brand} ${month} (${earnings.teamMember?.name}): ${existing.invoice_number}`,
      duplicate: true,
      existing: existing as { id: string; invoice_number: string; status: string },
    };
  }

  // Pull bill-to (brand-level: who at the brand pays) from brand_settings.
  // Error-checked: a failed read here would silently generate an invoice with
  // no bill-to at all.
  const { data: settings, error: settingsErr } = await supabase
    .from('brand_settings')
    .select('bill_to_name, bill_to_email, bill_to_address')
    .eq('brand', brand)
    .maybeSingle();
  if (settingsErr) return { ok: false, status: 500, error: settingsErr.message };

  // Default due date: 30 days from now.
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  const dueDateIso = dueDate.toISOString().split('T')[0];

  // All money fields flow through the shared invoice math — the same module
  // refresh and line-item edits use — never read piecemeal off the row.
  const line = computeInvoiceLineItems(row);

  const insertRow = {
    brand,
    period_month: month,
    team_member_id: teamMemberId,
    affiliate_gmv: line.affiliateGmv,
    marketing_gmv: line.marketingGmv,
    total_gmv: line.totalGmv,
    commission: line.commission,
    retainer: line.retainer,
    product_retainer: line.productRetainer,
    launch_fee: line.launchFee,
    total_amount: line.totalAmount,
    status: 'pending',
    due_date: dueDateIso,
    bill_to_name: settings?.bill_to_name ?? null,
    bill_to_email: settings?.bill_to_email ?? null,
    bill_to_address: settings?.bill_to_address ?? null,
    // Snapshot bill-FROM (the team member who's invoicing) at creation time
    // so future edits to their profile don't change historical invoices.
    bill_from_name: earnings.teamMember?.name ?? null,
    bill_from_email: earnings.teamMember?.email ?? null,
    bill_from_address: earnings.teamMember?.address ?? null,
    payment_instructions: earnings.teamMember?.paymentInstructions ?? DEFAULT_PAYMENT_INSTRUCTIONS,
    creator_breakdown: row.creators,
    created_by: args.createdBy ?? null,
  };

  // Sequential invoice number for this month (TEMPO-YYYY-MM-{N}). The start
  // is MAX(existing seq)+1, NOT count(*)+1: after deleting drafts, count
  // undercounts and can land the retry window entirely inside still-occupied
  // numbers, deterministically bricking the month after >=5 deletions
  // (adversarial-review finding). MAX+1 always lands above every occupied
  // number; the 23505 retry loop remains purely for concurrent-insert races.
  const { data: numberRows, error: numErr } = await supabase
    .from('invoices')
    .select('invoice_number')
    .eq('period_month', month)
    .like('invoice_number', `TEMPO-${month}-%`);
  if (numErr) return { ok: false, status: 500, error: numErr.message };
  const maxSeq = ((numberRows as { invoice_number: string }[] | null) ?? []).reduce((max, r) => {
    const n = parseInt(r.invoice_number.slice(`TEMPO-${month}-`.length), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  let created: Record<string, unknown> | null = null;
  let seq = maxSeq + 1;
  for (let attempt = 0; attempt < MAX_NUMBER_ATTEMPTS; attempt++, seq++) {
    const invoiceNumber = `TEMPO-${month}-${String(seq).padStart(3, '0')}`;
    const { data, error } = await supabase
      .from('invoices')
      .insert({ invoice_number: invoiceNumber, ...insertRow })
      .select()
      .single();
    if (!error) { created = data; break; }
    if (error.code === '23505' && error.message.includes('invoice_number')) continue; // number taken — try seq+1
    if (error.code === '23505') {
      // The (brand, period, team_member) unique index — a concurrent generate
      // for the same combination won the race after our duplicate pre-check.
      return {
        ok: false,
        status: 409,
        error: `Invoice already exists for ${brand} ${month} (${earnings.teamMember?.name})`,
        duplicate: true,
      };
    }
    return { ok: false, status: 500, error: error.message };
  }
  if (!created) {
    return {
      ok: false,
      status: 500,
      error: `Could not allocate a unique invoice number for ${month} after ${MAX_NUMBER_ATTEMPTS} attempts`,
    };
  }

  // Freeze the earnings row that produced this invoice (the earnings cockpit
  // renders drift against this snapshot). Warn-don't-fail: the invoice already
  // exists — failing now would misreport a completed generation.
  const ledgerError = await upsertEarningsLedger(supabase, {
    brandSlug: brand,
    periodMonth: month,
    teamMemberId,
    snapshot: row,
    invoiceId: String(created.id),
  });

  return {
    ok: true,
    status: 201,
    invoice: created,
    invoiceId: String(created.id),
    invoiceNumber: String(created.invoice_number),
    ...(ledgerError ? { ledgerError } : {}),
  };
}
