import { NextResponse } from 'next/server';

/**
 * Newsletter signup endpoint. Forwards emails to Loops.
 *
 * Activates when these env vars are set:
 *   LOOPS_FORM_ID  — the Form ID from Loops > Forms
 *   (alternatively LOOPS_API_KEY for the contacts API)
 */

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email' }, { status: 400 });
  }

  const formId = process.env.LOOPS_FORM_ID;
  const apiKey = process.env.LOOPS_API_KEY;

  // Prefer the Forms endpoint if a form is configured.
  if (formId) {
    try {
      const res = await fetch(`https://app.loops.so/api/newsletter-form/${formId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email }).toString(),
      });
      if (!res.ok) {
        return NextResponse.json({ error: 'Subscription failed' }, { status: 502 });
      }
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: 'Subscription failed' }, { status: 502 });
    }
  }

  // Fall back to the Contacts API if you've added an API key but no form.
  if (apiKey) {
    try {
      const res = await fetch('https://app.loops.so/api/v1/contacts/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ email, source: 'landing-page' }),
      });
      if (!res.ok) {
        return NextResponse.json({ error: 'Subscription failed' }, { status: 502 });
      }
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: 'Subscription failed' }, { status: 502 });
    }
  }

  // No Loops configured yet — soft-succeed in dev so the form still works locally.
  if (process.env.NODE_ENV !== 'production') {
    console.log('[newsletter] dev mode, no Loops config: would have subscribed', email);
    return NextResponse.json({ ok: true, dev: true });
  }

  return NextResponse.json(
    { error: 'Newsletter is not configured yet. Try again later.' },
    { status: 503 }
  );
}
