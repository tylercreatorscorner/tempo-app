/**
 * /api/invoices/[id]
 *
 * GET    — fetch single invoice
 * PATCH  — update editable fields (status, notes, due_date, bill_to_*, line items)
 * DELETE — remove an invoice (only if status = 'pending')
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const NUMERIC_FIELDS = new Set([
  'commission', 'retainer', 'product_retainer', 'launch_fee',
  'affiliate_gmv', 'marketing_gmv', 'total_gmv', 'total_amount',
]);
const STRING_OR_NULL_FIELDS = new Set([
  'notes', 'due_date', 'bill_to_name', 'bill_to_email', 'bill_to_address', 'payment_instructions',
]);
const STATUS_FIELD = 'status';
const STATUSES = new Set(['pending', 'sent', 'paid']);

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await ctx.params;
  const supabase = await createAdminClient();
  const { data, error } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ invoice: data });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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

  // If line items changed, recompute total_amount.
  const lineItemsChanged = ['commission', 'retainer', 'product_retainer', 'launch_fee'].some((k) => k in update);
  const supabase = await createAdminClient();

  if (lineItemsChanged) {
    const { data: current } = await supabase.from('invoices').select('commission, retainer, product_retainer, launch_fee').eq('id', id).maybeSingle();
    if (current) {
      const merged = { ...current, ...update };
      const total =
        Number(merged.commission ?? 0) +
        Number(merged.retainer ?? 0) +
        Number(merged.product_retainer ?? 0) +
        Number(merged.launch_fee ?? 0);
      update.total_amount = total;
    }
  }

  update.updated_at = new Date().toISOString();

  const { data, error } = await supabase.from('invoices').update(update).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoice: data });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await ctx.params;
  const supabase = await createAdminClient();

  const { data: existing } = await supabase.from('invoices').select('status').eq('id', id).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.status !== 'pending') {
    return NextResponse.json({ error: `Can only delete pending invoices (this one is ${existing.status})` }, { status: 400 });
  }

  const { error } = await supabase.from('invoices').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
