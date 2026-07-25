/**
 * POST /api/tiktok/connections/disconnect — stop using a brand's connection and
 * destroy the stored credential.
 *
 * Not a soft flag: deactivateConnection nulls both token columns in the same
 * statement. A row flagged inactive that still holds a live merchant token is a
 * credential nobody is watching.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { assertNotImpersonating } from '@/lib/auth/platform-admin';
import { deactivateConnection } from '@/lib/tiktok/connections';

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
    const body = (await request.json().catch(() => ({}))) as { brandSlug?: unknown };
    const brandSlug = typeof body.brandSlug === 'string' ? body.brandSlug.trim() : '';
    if (!brandSlug) return NextResponse.json({ error: 'brandSlug is required.' }, { status: 400 });

    const result = await deactivateConnection(brandSlug);
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });

    return NextResponse.json({ brandSlug });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[tiktok/connect] disconnect failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
