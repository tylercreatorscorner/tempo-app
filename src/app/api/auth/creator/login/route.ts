/**
 * POST /api/auth/creator/login
 *
 * Email-based magic-link request for the creator portal.
 * - Looks up the creator by email (case-insensitive).
 * - Mints a 15-minute single-use JWT (jti tracked in
 *   creator_magic_link_tokens on consume to block replay).
 * - Sends a sign-in email via Resend.
 *
 * Required env vars (production):
 *   RESEND_API_KEY            — Resend API key
 *   CREATOR_LOGIN_FROM_EMAIL  — verified Resend sender (falls back to
 *                                INVOICE_FROM_EMAIL if unset)
 *
 * In development, if Resend isn't configured the magic link is logged to the
 * server console AND returned as `dev_login_url` in the response so the dev
 * preview flow keeps working without a Resend account.
 *
 * Always returns the same `success: true` body whether or not the email
 * exists — don't leak account existence.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { generateMagicToken } from '@/lib/auth/creator-auth';

export const runtime = 'nodejs';

const NEUTRAL_RESPONSE = {
  success: true,
  message: 'If that email is registered, a login link has been sent.',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c),
  );
}

function buildEmailHtml(opts: { name: string | null; verifyUrl: string }): string {
  const greeting = opts.name ? `Hi ${escapeHtml(opts.name)},` : 'Hi,';
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#F8F9FC;font-family:'Inter',-apple-system,Helvetica,Arial,sans-serif;color:#1A1B3A;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <div style="background:#1A1B3A;border-radius:14px 14px 0 0;padding:24px 28px;color:#fff;">
      <div style="display:flex;align-items:baseline;">
        <span style="font-size:22px;font-weight:800;letter-spacing:-0.4px;">tempo</span>
        <span style="font-size:22px;font-weight:800;color:#FF4D8D;">.</span>
      </div>
      <p style="margin:6px 0 0;font-size:10px;letter-spacing:2px;text-transform:uppercase;font-weight:600;color:#A0A4D8;">Creator sign-in</p>
    </div>
    <div style="background:#fff;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 14px 14px;padding:28px;">
      <p style="margin:0 0 12px;font-size:15px;line-height:1.55;">${greeting}</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#374151;">
        Click the button below to sign in to your Tempo creator portal.
        This link expires in <strong>15 minutes</strong> and can only be used once.
      </p>
      <p style="margin:24px 0;text-align:center;">
        <a href="${opts.verifyUrl}" style="display:inline-block;background:#1A1B3A;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 26px;border-radius:10px;">Sign in to Tempo</a>
      </p>
      <p style="margin:0;font-size:12px;line-height:1.55;color:#9CA3AF;">
        If the button doesn't work, paste this link into your browser:<br/>
        <span style="word-break:break-all;color:#6B7280;">${escapeHtml(opts.verifyUrl)}</span>
      </p>
      <p style="margin:24px 0 0;font-size:12px;line-height:1.55;color:#9CA3AF;">
        Didn't request this? You can safely ignore the email — no one can sign in without clicking the link.
      </p>
    </div>
    <p style="margin:14px 0 0;text-align:center;font-size:11px;color:#9CA3AF;">Powered by Tempo</p>
  </div>
</body></html>`;
}

async function sendMagicLinkEmail(opts: {
  to: string;
  name: string | null;
  verifyUrl: string;
}): Promise<{ ok: true } | { ok: false; reason: 'unconfigured' | 'send_failed'; details?: unknown }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.CREATOR_LOGIN_FROM_EMAIL || process.env.INVOICE_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    return { ok: false, reason: 'unconfigured' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [opts.to],
      subject: 'Sign in to Tempo',
      html: buildEmailHtml({ name: opts.name, verifyUrl: opts.verifyUrl }),
    }),
  });

  if (!res.ok) {
    const details = await res.json().catch(() => ({}));
    return { ok: false, reason: 'send_failed', details };
  }
  return { ok: true };
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const supabase = await createAdminClient();
    const { data: creator } = await supabase
      .from('creators_v2')
      .select('id, email, real_name')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    // Same response whether or not the email matches — don't leak account existence.
    if (!creator) return NextResponse.json(NEUTRAL_RESPONSE);

    const { token, jti, expiresAt } = await generateMagicToken({
      creatorId: creator.id,
      email: creator.email,
    });
    const verifyUrl = `${request.nextUrl.origin}/api/auth/creator/verify?token=${token}`;

    const sendResult = await sendMagicLinkEmail({
      to: creator.email,
      name: (creator.real_name as string | null) ?? null,
      verifyUrl,
    });

    const isProd = process.env.NODE_ENV === 'production';

    if (!sendResult.ok) {
      if (sendResult.reason === 'unconfigured' && !isProd) {
        // Dev fallback: surface the link directly so local dev still works.
        console.log(`[Creator Login] (dev, email unconfigured) ${creator.email}: ${verifyUrl}`);
        return NextResponse.json({ ...NEUTRAL_RESPONSE, dev_login_url: verifyUrl });
      }
      if (sendResult.reason === 'unconfigured') {
        // Prod with no email setup — fail loudly so we don't silently succeed.
        return NextResponse.json(
          {
            error: 'Email is not configured',
            hint: 'Set RESEND_API_KEY and CREATOR_LOGIN_FROM_EMAIL (or INVOICE_FROM_EMAIL) on the server.',
          },
          { status: 501 },
        );
      }
      // Resend rejected the send — log details server-side, surface a generic 502.
      console.error('[Creator Login] Resend rejected send:', sendResult.details);
      return NextResponse.json(
        { error: 'Failed to send sign-in email. Please try again in a moment.' },
        { status: 502 },
      );
    }

    // Optional: persist the JTI as "minted but not consumed" — but our model
    // is "consume = insert", so nothing to write here. expiresAt is encoded
    // in the JWT itself; the verify route extracts it for the consume row.
    void jti; void expiresAt;

    return NextResponse.json(NEUTRAL_RESPONSE);
  } catch (err) {
    console.error('[Creator Login] Unexpected error:', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
