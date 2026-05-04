/**
 * POST /api/invoices/[id]/email
 *
 * Sends the invoice to its bill_to_email via Resend, with the PDF attached
 * and a link to the public share page. On successful send, marks the
 * invoice as 'sent' (auto-stamps sent_at).
 *
 * Required env vars:
 *   RESEND_API_KEY       — Resend API key
 *   INVOICE_FROM_EMAIL   — verified sender (e.g. "billing@yourdomain.com")
 *   NEXT_PUBLIC_APP_URL  — base URL used to construct the share link
 *
 * Body (optional):
 *   { cc?: string[], message?: string }   // optional CC + custom intro
 *
 * Returns 501 if email isn't configured (graceful degradation).
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';
import { renderInvoicePdf, type InvoicePdfData } from '@/lib/invoices/pdf';
import { formatPeriod } from '@/lib/utils/format';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface PostBody {
  cc?: unknown;
  message?: unknown;
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}

function appBaseUrl(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, '');
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

function newToken(): string {
  return randomBytes(24).toString('base64url');
}

function buildEmailHtml(opts: {
  invoiceNumber: string;
  brandName: string;
  periodLabel: string;
  totalAmount: number;
  dueDate: string | null;
  shareUrl: string;
  customMessage: string | null;
}): string {
  const { invoiceNumber, brandName, periodLabel, totalAmount, dueDate, shareUrl, customMessage } = opts;
  const dueLine = dueDate
    ? `Payable on or before <strong>${new Date(dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>.`
    : '';

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#F8F9FC;font-family:'Inter',-apple-system,Helvetica,Arial,sans-serif;color:#1A1B3A;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="background:#1A1B3A;border-radius:14px 14px 0 0;padding:24px 28px;color:#fff;">
      <div style="display:flex;align-items:baseline;">
        <span style="font-size:22px;font-weight:800;letter-spacing:-0.4px;">tempo</span>
        <span style="font-size:22px;font-weight:800;color:#FF4D8D;">.</span>
      </div>
      <p style="margin:6px 0 0;font-size:10px;letter-spacing:2px;text-transform:uppercase;font-weight:600;color:#A0A4D8;">Invoice ${invoiceNumber}</p>
    </div>
    <div style="background:#fff;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 14px 14px;padding:28px;">
      <p style="margin:0 0 12px;font-size:15px;line-height:1.55;">Hi${brandName ? ` ${brandName}` : ''},</p>
      ${customMessage ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#374151;white-space:pre-line;">${escapeHtml(customMessage)}</p>` : ''}
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#374151;">
        Your invoice for <strong>${periodLabel}</strong> is ready.
        ${dueLine ? ` ${dueLine}` : ''}
      </p>
      <div style="background:#FFF0F5;border:1px solid #FFE6F0;border-left:4px solid #FF4D8D;border-radius:8px;padding:16px 18px;margin:20px 0;">
        <p style="margin:0;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;color:#E91E8C;">Total Due</p>
        <p style="margin:4px 0 0;font-size:24px;font-weight:800;color:#1A1B3A;">${fmtCurrency(totalAmount)}</p>
      </div>
      <p style="margin:20px 0;text-align:center;">
        <a href="${shareUrl}" style="display:inline-block;background:#1A1B3A;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;">View invoice online</a>
      </p>
      <p style="margin:0 0 4px;font-size:13px;line-height:1.55;color:#6B7280;">A PDF copy is also attached for your records.</p>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.55;color:#374151;">
        Thanks,<br/>
        Creators Corner
      </p>
    </div>
    <p style="margin:14px 0 0;text-align:center;font-size:11px;color:#9CA3AF;">Powered by Tempo</p>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c),
  );
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Configuration check — graceful 501 if not set up
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.INVOICE_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    return NextResponse.json({
      error: 'Email is not configured',
      hint: 'Set RESEND_API_KEY and INVOICE_FROM_EMAIL in your environment to enable invoice emailing. INVOICE_FROM_EMAIL must be a verified sender in your Resend account.',
    }, { status: 501 });
  }

  let body: PostBody = {};
  try { body = await req.json(); } catch { /* empty body OK */ }
  const cc = Array.isArray(body.cc) ? (body.cc as unknown[]).filter((v) => typeof v === 'string') as string[] : [];
  const customMessage = typeof body.message === 'string' && body.message.trim() ? body.message.trim() : null;

  const { id } = await ctx.params;
  const supabase = await createAdminClient();

  const { data: invoice, error: fetchErr } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const recipient = invoice.bill_to_email as string | null;
  if (!recipient) {
    return NextResponse.json({
      error: 'No recipient email on this invoice',
      hint: 'Set bill_to_email on the invoice (or on the brand) before sending.',
    }, { status: 400 });
  }

  if (invoice.status === 'void') {
    return NextResponse.json({ error: "Can't email a voided invoice" }, { status: 400 });
  }

  // Lazy-generate share token if missing
  let token = invoice.public_token as string | null;
  if (!token) {
    token = newToken();
    const { error: tokenErr } = await supabase
      .from('invoices')
      .update({ public_token: token, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (tokenErr) return NextResponse.json({ error: tokenErr.message }, { status: 500 });
  }
  const shareUrl = `${appBaseUrl(req)}/share/invoice/${token}`;

  // Resolve brand display name + render PDF
  const { data: brandRow } = await supabase
    .from('brands_v2')
    .select('name')
    .eq('slug', invoice.brand)
    .maybeSingle();
  const brandName = brandRow?.name ?? invoice.brand;

  const pdfData: InvoicePdfData = {
    invoiceNumber: invoice.invoice_number,
    brandSlug: invoice.brand,
    brandName,
    periodMonth: invoice.period_month,
    generatedAt: invoice.generated_at,
    dueDate: invoice.due_date,
    status: invoice.status,
    affiliateGmv: Number(invoice.affiliate_gmv ?? 0),
    marketingGmv: Number(invoice.marketing_gmv ?? 0),
    totalGmv: Number(invoice.total_gmv ?? 0),
    commission: Number(invoice.commission ?? 0),
    retainer: Number(invoice.retainer ?? 0),
    productRetainer: Number(invoice.product_retainer ?? 0),
    launchFee: Number(invoice.launch_fee ?? 0),
    totalAmount: Number(invoice.total_amount ?? 0),
    notes: invoice.notes,
    paymentInstructions: invoice.payment_instructions,
    billTo: {
      name: invoice.bill_to_name,
      email: invoice.bill_to_email,
      address: invoice.bill_to_address,
    },
    creators: Array.isArray(invoice.creator_breakdown)
      ? invoice.creator_breakdown.map((c: { name?: string; gmv?: number; rate?: number; commission?: number }) => ({
          name: String(c.name ?? ''),
          gmv: Number(c.gmv ?? 0),
          rate: Number(c.rate ?? 0),
          commission: Number(c.commission ?? 0),
        }))
      : [],
  };
  const pdfBuffer = await renderInvoicePdf(pdfData);

  // Build sender-friendly subject + body
  const periodLabel = formatPeriod(invoice.period_month);
  const subject = `Invoice ${invoice.invoice_number} — ${brandName} (${periodLabel})`;
  const html = buildEmailHtml({
    invoiceNumber: invoice.invoice_number,
    brandName,
    periodLabel,
    totalAmount: Number(invoice.total_amount ?? 0),
    dueDate: invoice.due_date,
    shareUrl,
    customMessage,
  });

  // Filename mirrors the download endpoint
  const safeBrand = brandName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
  const [yyyy, mm] = invoice.period_month.split('-').map(Number);
  const monthLabel = new Date(Date.UTC(yyyy, (mm ?? 1) - 1, 1))
    .toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  const attachmentFilename = `${safeBrand}_${monthLabel}-${yyyy}.pdf`;

  // Send via Resend
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [recipient],
      cc: cc.length > 0 ? cc : undefined,
      subject,
      html,
      attachments: [{
        filename: attachmentFilename,
        content: pdfBuffer.toString('base64'),
      }],
    }),
  });

  const resendBody = await resendRes.json().catch(() => ({}));
  if (!resendRes.ok) {
    return NextResponse.json(
      { error: 'Resend rejected the send', details: resendBody },
      { status: 502 },
    );
  }

  // Mark as sent (auto-stamps sent_at)
  const nowIso = new Date().toISOString();
  const { data: updated, error: updateErr } = await supabase
    .from('invoices')
    .update({ status: 'sent', sent_at: nowIso, updated_at: nowIso })
    .eq('id', id)
    .select()
    .single();
  if (updateErr) {
    // Email succeeded but status update failed — surface a partial success
    return NextResponse.json(
      { ok: true, sent: true, statusUpdated: false, statusError: updateErr.message, resend: resendBody },
      { status: 200 },
    );
  }

  return NextResponse.json({
    ok: true,
    sent: true,
    statusUpdated: true,
    invoice: updated,
    shareUrl,
    resend: resendBody,
  });
}
