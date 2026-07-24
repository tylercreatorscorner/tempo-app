/**
 * /api/invoices/[id]
 *
 * GET    — fetch single invoice
 * PATCH  — update editable fields (status, notes, due_date, bill_to_*, line items)
 * DELETE — remove an invoice (only if status = 'pending')
 */
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope, type WorkspaceScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';
import { getBrandRegistry } from '@/lib/data/brand-registry';
import { applyCompensationModel, resolveCompensationModel } from '@/lib/finance/invoice-math';

export const runtime = 'nodejs';

/**
 * Confirms the caller may act on this invoice. Managers are limited to
 * invoices for brands in their user_brand_access; owner/admin unrestricted.
 * Returns a NextResponse to return on failure, or null to proceed.
 */
async function authorizeInvoice(
  scope: WorkspaceScope,
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  id: string,
): Promise<NextResponse | null> {
  const { data: inv } = await supabase
    .from('invoices').select('brand').eq('id', id).maybeSingle();
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (
    scope.brandScope.kind === 'scoped' &&
    !(inv.brand && scope.brandScope.brandSlugs.includes(inv.brand))
  ) {
    return NextResponse.json({ error: 'Forbidden: brand not in your access' }, { status: 403 });
  }
  return null;
}

const NUMERIC_FIELDS = new Set([
  'commission', 'retainer', 'product_retainer', 'launch_fee',
  'affiliate_gmv', 'marketing_gmv', 'total_gmv', 'total_amount',
  'amount_received',
]);
const STRING_OR_NULL_FIELDS = new Set([
  'notes', 'due_date', 'bill_to_name', 'bill_to_email', 'bill_to_address', 'payment_instructions',
  'payment_method', 'payment_reference', 'payment_received_notes',
  // The optional personal line on the public invoice page (Phase A). Null/''
  // clears it.
  'share_note',
]);
/** share_note renders on a client-facing page — keep it a short human note. */
const SHARE_NOTE_MAX = 500;
const STATUS_FIELD = 'status';
const STATUSES = new Set(['pending', 'sent', 'paid', 'void']);

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!scope.canViewFinance) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await ctx.params;
  const supabase = await createAdminClient();
  const denied = await authorizeInvoice(scope, supabase, id);
  if (denied) return denied;
  const { data, error } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ invoice: data });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!scope.canViewFinance) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const update: Record<string, unknown> = {};
  for (const [field, raw] of Object.entries(body)) {
    if (NUMERIC_FIELDS.has(field)) {
      const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: `${field} must be a non-negative number` }, { status: 400 });
      }
      update[field] = n;
    } else if (STRING_OR_NULL_FIELDS.has(field)) {
      if (raw === null || raw === '') update[field] = null;
      else if (typeof raw === 'string') update[field] = raw;
      else return NextResponse.json({ error: `${field} must be string or null` }, { status: 400 });
    } else if (field === STATUS_FIELD) {
      if (typeof raw !== 'string' || !STATUSES.has(raw)) {
        return NextResponse.json({ error: `status must be one of ${[...STATUSES].join(', ')}` }, { status: 400 });
      }
      update.status = raw;
      // Auto-stamp timestamps on status transitions
      const nowIso = new Date().toISOString();
      if (raw === 'sent') update.sent_at = nowIso;
      if (raw === 'paid') update.paid_at = nowIso;
    } else {
      return NextResponse.json({ error: `Field "${field}" is not editable` }, { status: 400 });
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  if (typeof update.share_note === 'string' && update.share_note.length > SHARE_NOTE_MAX) {
    return NextResponse.json(
      { error: `share_note must be ${SHARE_NOTE_MAX} characters or fewer` },
      { status: 400 },
    );
  }

  // If line items changed, recompute total_amount.
  const lineItemsChanged = ['commission', 'retainer', 'product_retainer', 'launch_fee'].some((k) => k in update);
  const supabase = await createAdminClient();

  const denied = await authorizeInvoice(scope, supabase, id);
  if (denied) return denied;

  if (lineItemsChanged) {
    const { data: current, error: curErr } = await supabase
      .from('invoices')
      .select('commission, retainer, product_retainer, launch_fee, brand, team_member_id')
      .eq('id', id)
      .maybeSingle();
    if (curErr) return NextResponse.json({ error: curErr.message }, { status: 500 });
    if (current) {
      const merged = { ...current, ...update };
      // Recompute through the shared invoice math, honoring the brand's
      // compensation model for THIS invoice's payee. The old unconditional
      // commission+retainer+fees sum over-billed revshare_max / *_only brands
      // on every line-item edit.
      try {
        const reg = await getBrandRegistry();
        const model = await resolveCompensationModel(
          supabase,
          reg,
          current.brand as string,
          (current.team_member_id as string | null) ?? null,
        );
        // Persist the MODEL-ADJUSTED line items, not the raw edits — a stored
        // non-zero loser line would render on the PDF/share view while the
        // total excludes it: a client-facing invoice whose rows don't sum
        // (adversarial-review finding). Mirrors generation.
        const adj = applyCompensationModel(
          Number(merged.commission ?? 0),
          Number(merged.retainer ?? 0),
          model,
        );
        update.commission = adj.commission;
        update.retainer = adj.retainer;
        update.total_amount =
          adj.commission + adj.retainer + Number(merged.product_retainer ?? 0) + Number(merged.launch_fee ?? 0);
      } catch (e) {
        // A failed model read must not fall back to a silently-wrong sum.
        const message = e instanceof Error ? e.message : 'Failed to resolve compensation model';
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }
  }

  update.updated_at = new Date().toISOString();

  const { data, error } = await supabase.from('invoices').update(update).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoice: data });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!scope.canViewFinance) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await ctx.params;
  const supabase = await createAdminClient();

  const denied = await authorizeInvoice(scope, supabase, id);
  if (denied) return denied;

  const { data: existing } = await supabase.from('invoices').select('status').eq('id', id).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.status !== 'pending') {
    return NextResponse.json({ error: `Can only delete pending invoices (this one is ${existing.status})` }, { status: 400 });
  }

  const { error } = await supabase.from('invoices').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
