/**
 * POST /api/feedback — the in-app rating widget.
 *
 * 🚨 THIS ROUTE TOOK tenant_id AND user_id FROM THE REQUEST BODY AND WROTE
 * THEM WITH THE SERVICE ROLE, with no check of its own.
 *
 * ⚠️ SCOPE OF THAT, STATED ACCURATELY: the middleware already bounced
 * unauthenticated callers, so this was never open to the internet. It was open
 * to every SIGNED-IN account, which on this tenant means 191 creators and the
 * brand contacts as well as staff — any of whom could write a feedback row
 * attributed to any tenant and any user, with nothing in the row to show it had
 * not come from that person.
 *
 * ⚠️ Nothing needed those parameters. The widget only ever sent rating, message
 * and page_url, so both fields were pure attack surface: every genuine row was
 * being written with a null tenant and a null user anyway. They are now derived
 * from the session and the body is ignored for them entirely.
 *
 * ⚠️ Authentication, not authorisation. There is no permission check because
 * anyone who can sign in may rate the product; the point is that the row is
 * attributed to whoever actually sent it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // Session first: an unauthenticated caller has nothing to attribute a row to,
  // and inventing one is exactly the bug being fixed.
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { rating?: unknown; message?: unknown; page_url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Rating must be a whole number from 1 to 5' }, { status: 400 });
  }

  // Capped rather than rejected: a long note is still feedback, and losing it
  // to a validation error helps nobody.
  const message =
    typeof body.message === 'string' && body.message.trim()
      ? body.message.trim().slice(0, 4000)
      : null;
  const pageUrl =
    typeof body.page_url === 'string' && body.page_url.trim()
      ? body.page_url.trim().slice(0, 500)
      : null;

  const admin = await createAdminClient();

  // ⚠️ The tenant comes from the caller's OWN profile row, never from input.
  const { data: profile } = await admin
    .from('user_profiles')
    .select('tenant_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const { data, error } = await admin
    .from('feedback')
    .insert({
      tenant_id: (profile?.tenant_id as string | null) ?? null,
      user_id: user.id,
      rating,
      message,
      page_url: pageUrl,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, id: data.id });
}
