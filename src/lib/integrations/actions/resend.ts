/**
 * Resend (email) action library — direct HTTPS API.
 *
 * Tempo's `RESEND_API_KEY` is shared workspace-wide (one Resend account, all
 * brands). Per Tyler's design call, no per-tenant BYOK — Tempo absorbs the
 * email cost. Same key powers the existing invoice email flow at
 * `/api/invoices/[id]/email`.
 *
 * Env required:
 *   RESEND_API_KEY              the API key from resend.com
 *   RESEND_FROM_EMAIL           e.g. "Tempo <hello@app.tempoapp.ai>"
 *                               must be a verified sender in your Resend account
 */

const API_BASE = 'https://api.resend.com';

export interface ResendSendResult {
  ok: boolean;
  /** Resend's message id (UUID). */
  id?: string;
  status?: number;
  error?: string;
}

interface SendArgs {
  to: string;
  subject: string;
  /** Plain-text body. We send both text and a minimally-formatted HTML view. */
  body: string;
  replyTo?: string;
  cc?: string;
  /** Override sender — defaults to RESEND_FROM_EMAIL env. */
  from?: string;
}

function bodyToHtml(text: string): string {
  // Tiny escape + paragraph-break formatter. Good enough for transactional
  // emails the user types in a textarea. If we eventually want Markdown,
  // swap in a tiny renderer here.
  const esc = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Double newline → paragraph, single newline → <br>
  const paragraphs = esc.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`);
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;line-height:1.5;color:#1A1B3A">${paragraphs.join('\n')}</body></html>`;
}

function splitAddresses(s: string | undefined): string[] | undefined {
  if (!s) return undefined;
  const parts = s.split(',').map(p => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

export async function sendEmail({ to, subject, body, replyTo, cc, from }: SendArgs): Promise<ResendSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY env var is not set' };

  const fromAddr = from ?? process.env.RESEND_FROM_EMAIL ?? 'Tempo <hello@tempoapp.ai>';
  const toAddrs = splitAddresses(to);
  if (!toAddrs || toAddrs.length === 0) return { ok: false, error: '`to` is required (one or more email addresses)' };
  if (!subject.trim()) return { ok: false, error: 'subject is required' };
  if (!body.trim()) return { ok: false, error: 'body is required' };

  try {
    const res = await fetch(`${API_BASE}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddr,
        to: toAddrs,
        subject,
        text: body,
        html: bodyToHtml(body),
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(cc ? { cc: splitAddresses(cc) } : {}),
      }),
    });

    const j = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) {
      return { ok: false, status: res.status, error: j.message ?? j.name ?? `HTTP ${res.status}` };
    }
    return { ok: true, id: j.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}
