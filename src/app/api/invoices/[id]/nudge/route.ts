/**
 * POST /api/invoices/[id]/nudge — one-click payment reminder with a memory.
 *
 * Open invoices only (pending | sent). Ensures a share token exists, then:
 *   - if the invoice has a bill_to_email AND Resend is configured, re-sends
 *     the invoice link wrapped in a short reminder email;
 *   - ALWAYS stamps last_nudged_at = now and nudge_count + 1, and returns
 *     { url } so the operator can paste the link into any channel manually.
 *
 * When email can't go out (unconfigured, no recipient, or Resend rejects)
 * the response is still 200 with emailed:false + an honest warning — the
 * nudge happened (copy-based), it just wasn't emailed. A pending invoice
 * that gets nudged is stamped sent: the client has now been contacted.
 *
 * The email wrapper is a deliberate MINIMAL duplicate of the /email route's
 * Resend plumbing: that route's core is the PDF attachment + full invoice
 * email, which a reminder doesn't want (the link carries the invoice), so
 * sharing a lib would mean abstracting two genuinely different emails.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { guardInvoiceAction } from '@/lib/finance/invoice-guard';
import { daysOverdue, todayIsoUtc } from '@/lib/finance/overdue';
import { formatPeriod } from '@/lib/utils/format';

export const runtime = 'nodejs';
export const maxDuration = 30;

function appBaseUrl(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, '');
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

function newToken(): string {
  return randomBytes(24).toString('base64url');
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c),
  );
}

function buildReminderHtml(opts: {
  invoiceNumber: string;
  brandName: string;
  periodLabel: string;
  totalAmount: number;
  dueLine: string | null;
  shareUrl: string;
}): string {
  const { invoiceNumber, brandName, periodLabel, totalAmount, dueLine, shareUrl } = opts;
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#F8F9FC;font-family:'Inter',-apple-system,Helvetica,Arial,sans-serif;color:#1A1B3A;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="background:#1A1B3A;border-radius:14px 14px 0 0;padding:24px 28px;color:#fff;">
      <div style="display:flex;align-items:baseline;">
        <span style="font-size:22px;font-weight:800;letter-spacing:-0.4px;">tempo</span>
        <span style="font-size:22px;font-weight:800;color:#FF4D8D;">.</span>
      </div>
      <p style="margin:6px 0 0;font-size:10px;letter-spacing:2px;text-transform:uppercase;font-weight:600;color:#A0A4D8;">Payment reminder &middot; Invoice ${escapeHtml(invoiceNumber)}</p>
    </div>
    <div style="background:#fff;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 14px 14px;padding:28px;">
      <p style="margin:0 0 12px;font-size:15px;line-height:1.55;">Hi${brandName ? ` ${escapeHtml(brandName)}` : ''},</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#374151;">
        A friendly reminder that invoice <strong>${escapeHtml(invoiceNumber)}</strong> for <strong>${escapeHtml(periodLabel)}</strong>
        (<strong>${fmtCurrency(totalAmount)}</strong>) is still open.${dueLine ? ` ${dueLine}` : ''}
      </p>
      <p style="margin:20px 0;text-align:center;">
        <a href="${shareUrl}" style="display:inline-block;background:#1A1B3A;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;">View invoice online</a>
      </p>
      <p style="margin:0 0 4px;font-size:13px;line-height:1.55;color:#6B7280;">Payment details and a PDF download are on the invoice page. If payment is already on its way, please disregard this note.</p>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.55;color:#374151;">
        Thanks,<br/>
        Creators Corner
      </p>
    </div>
    <p style="margin:14px 0 0;text-align:center;font-size:11px;color:#9CA3AF;">Powered by Tempo</p>
  </div>
</body></html>`;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const guard = await guardInvoiceAction(id);
  if (!guard.ok) return guard.response;
  const { supabase, invoice } = guard;

  const status = invoice.status as string;
  if (status !== 'pending' && status !== 'sent') {
    return NextResponse.json(
      { error: `Can only nudge open invoices (this one is ${status})` },
      { status: 400 },
    );
  }

  // Ensure the share link exists — the nudge IS the link, whatever channel
  // carries it.
  let token = invoice.public_token as string | null;
  const mintedToken = !token;
  if (!token) token = newToken();
  const url = `${appBaseUrl(req)}/share/invoice/${token}`;

  // Try the email leg first so the stamp below reflects what actually went out.
  let emailed = false;
  let warning: string | null = null;
  const recipient = invoice.bill_to_email as string | null;
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.INVOICE_FROM_EMAIL;

  if (!recipient) {
    warning = 'No recipient email on this invoice - nudge logged, paste the link manually.';
  } else if (!apiKey || !fromEmail) {
    warning = 'Email is not configured (RESEND_API_KEY / INVOICE_FROM_EMAIL) - nudge logged, paste the link manually.';
  } else {
    const { data: brandRow } = await supabase
      .from('brands_v2')
      .select('name')
      .eq('slug', invoice.brand as string)
      .maybeSingle();
    const brandName = brandRow?.name ?? (invoice.brand as string);
    const periodLabel = formatPeriod(invoice.period_month as string);

    const dueDate = invoice.due_date as string | null;
    const late = daysOverdue({ status, due_date: dueDate }, todayIsoUtc());
    const dueLine = late > 0
      ? `It is now <strong>${late} day${late === 1 ? '' : 's'} past due</strong>.`
      : dueDate
        ? `It is due <strong>${new Date(dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>.`
        : null;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipient],
        subject: `Payment reminder: Invoice ${invoice.invoice_number} (${brandName}, ${periodLabel})`,
        html: buildReminderHtml({
          invoiceNumber: invoice.invoice_number as string,
          brandName,
          periodLabel,
          totalAmount: Number(invoice.total_amount ?? 0),
          dueLine,
          shareUrl: url,
        }),
      }),
    });
    if (resendRes.ok) {
      emailed = true;
    } else {
      const detail = await resendRes.json().catch(() => ({}));
      warning = `Resend rejected the reminder (${resendRes.status}${detail?.message ? `: ${detail.message}` : ''}) - nudge logged, paste the link manually.`;
    }
  }

  // ALWAYS stamp the nudge — the operator is contacting the client either way
  // (email or pasted link), and the log is what makes "nudged Jul 20" honest.
  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> = {
    last_nudged_at: nowIso,
    nudge_count: Number(invoice.nudge_count ?? 0) + 1,
    updated_at: nowIso,
  };
  if (mintedToken) update.public_token = token;
  if (status === 'pending') {
    // Nudging a draft means the client has now been contacted — stamp reality,
    // same as the Send action.
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

  return NextResponse.json({
    ok: true,
    url,
    emailed,
    ...(warning ? { warning } : {}),
    invoice: updated,
  });
}
