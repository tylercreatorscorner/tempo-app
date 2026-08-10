/**
 * POST /api/invoices/[id]/send — "the link IS the invoice" send action.
 *
 * Ensures a public_token exists (minted exactly like /share does), stamps
 * status='sent' + sent_at when the invoice is currently 'pending', and
 * returns the share URL for the operator to copy. Already-sent (or paid)
 * invoices keep their status — re-sending just re-surfaces the link.
 *
 * This is what fixes the everything-stays-pending board: copying the link
 * counts as sending, so the lifecycle columns finally mean what they say.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkInvoiceReadiness, readinessError } from '@/lib/invoices/readiness';
import { randomBytes } from 'node:crypto';
import { guardInvoiceAction } from '@/lib/finance/invoice-guard';

export const runtime = 'nodejs';

function appBaseUrl(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, '');
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

function newToken(): string {
  // 24 random bytes -> ~32 char URL-safe base64. Effectively unguessable.
  return randomBytes(24).toString('base64url');
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const guard = await guardInvoiceAction(id);
  if (!guard.ok) return guard.response;
  const { supabase, invoice } = guard;

  if (invoice.status === 'void') {
    return NextResponse.json({ error: "Can't send a voided invoice" }, { status: 400 });
  }

  // Readiness gate. All 4 invoices ever sent went out with no recipient and no
  // payment instructions, so the send button was the wrong place to be silent.
  // `force: true` waives it — the operator may have a reason, but they have to
  // have seen the list first. Shared with /email via checkInvoiceReadiness so
  // the two paths cannot drift.
  let force = false;
  try {
    const body = await req.json();
    force = body?.force === true;
  } catch {
    // No body is the normal case for this endpoint.
  }
  const readiness = checkInvoiceReadiness(invoice);
  if (!readiness.ready && !force) {
    return NextResponse.json(readinessError(readiness), { status: 422 });
  }

  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: nowIso };

  let token = invoice.public_token as string | null;
  if (!token) {
    token = newToken();
    update.public_token = token;
  }

  // Only a pending invoice transitions; sent/paid keep their status + sent_at.
  const statusChanged = invoice.status === 'pending';
  if (statusChanged) {
    update.status = 'sent';
    update.sent_at = nowIso;
  }

  const { data: updated, error } = await supabase
    .from('invoices')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const url = `${appBaseUrl(req)}/share/invoice/${token}`;
  return NextResponse.json({ ok: true, url, token, statusChanged, invoice: updated });
}
