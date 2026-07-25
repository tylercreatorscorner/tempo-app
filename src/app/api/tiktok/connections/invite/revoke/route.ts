/**
 * POST /api/tiktok/connections/invite/revoke — kill a client connect link.
 *
 * The link goes out by email, which means it can be forwarded, sit in a shared
 * inbox, or reach the wrong person entirely. Revocation is the only control the
 * operator has over an artifact that has already left the building, so it is a
 * first-class action rather than "wait 72 hours".
 *
 * Takes the invite id, not the token: the id is stable, non-secret, and already
 * on screen in the panel.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { assertNotImpersonating } from '@/lib/auth/platform-admin';
import { revokeConnectInvite } from '@/lib/tiktok/connect-invites';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    await assertNotImpersonating();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Read-only' }, { status: 403 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { id?: unknown };
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

    // Report what actually happened. "Revoked" on a zero-row update is a claim
    // that a link can no longer be used, and it would be false — the operator
    // would stop worrying about a link that still works.
    const revoked = await revokeConnectInvite(id);
    if (!revoked) {
      return NextResponse.json(
        { error: 'That link had already been used, revoked, or expired.' },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[tiktok/connect] invite revoke failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
