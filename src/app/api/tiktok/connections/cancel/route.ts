/**
 * POST /api/tiktok/connections/cancel — discard a pending authorization.
 *
 * Exists so an operator who sees the wrong seller's shops (or simply changes
 * their mind) can erase the parked token pair immediately, instead of leaving a
 * live merchant credential to age out of its window.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { assertNotImpersonating } from '@/lib/auth/platform-admin';
import { clearPendingAuthorization } from '@/lib/tiktok/oauth-state';

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
    const body = (await request.json().catch(() => ({}))) as { state?: unknown };
    const state = typeof body.state === 'string' ? body.state.trim() : '';
    if (!state) return NextResponse.json({ error: 'state is required.' }, { status: 400 });

    // Report what actually happened. "Discarded" on a zero-row update is a
    // claim about a credential, and it would be false.
    const cleared = await clearPendingAuthorization(state);
    if (!cleared) {
      return NextResponse.json(
        { error: 'That authorization had already been cleared or has expired.' },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[tiktok/connect] cancel failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
