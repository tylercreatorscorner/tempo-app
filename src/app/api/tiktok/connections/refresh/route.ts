/**
 * POST /api/tiktok/connections/refresh   { brand: "jiyu" }
 *
 * Rotate a brand's TikTok token pair NOW, on purpose, while someone is watching.
 *
 * WHY THIS IS A DELIBERATE ACTION AND NOT A TEST: the refresh path has never
 * executed against TikTok. `last_token_refresh` is NULL. It only fires from
 * getActiveConnection inside a 15-minute expiry skew, so for JiYu the first real
 * attempt would have happened unattended at 2026-08-03 15:17 UTC. A refresh path
 * that has never run is not a working refresh path — it is an assumption with a
 * date on it.
 *
 * ⚠️ THIS CAN COST THE CONNECTION, and that is not hypothetical. TikTok may
 * invalidate the old refresh token the instant it issues a new pair. If the mint
 * succeeds and the write fails, the merchant must re-authorize. rotateTokens
 * guards it as tightly as it can — one atomic update, rowcount asserted rather
 * than trusting `error === null`, and an explicit "reconnect the brand" verdict
 * on a failed save — but the window cannot be closed completely.
 *
 * Running it FIVE DAYS EARLY is exactly what makes that acceptable. The same
 * failure on 2026-08-03 arrives with no warning, no operator, and a dead
 * pipeline. Here it arrives with the merchant reachable during business hours.
 *
 * The sibling /test route deliberately does NOT refresh, for the opposite
 * reason: a "test" that rotates credentials as a side effect is a trap. This
 * route rotates because that is the whole request, and it PERSISTS.
 *
 * Returns EXPIRY DATES ONLY. Never a token, never a cipher.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { assertNotImpersonating } from '@/lib/auth/platform-admin';
import { forceTokenRefresh } from '@/lib/tiktok/connections';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Rotating live merchant credentials is a mutation, so a read-only
  // "viewing as" session must not be able to trigger it.
  try {
    await assertNotImpersonating();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Read-only session' },
      { status: 403 },
    );
  }

  let brand = '';
  try {
    const body = (await request.json()) as { brand?: string };
    brand = (body.brand ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON: { brand }' }, { status: 400 });
  }
  if (!brand) return NextResponse.json({ error: 'Missing brand' }, { status: 400 });

  const result = await forceTokenRefresh(brand);

  if (!result.ok) {
    // 409, not 500: a rejected refresh token is a real answer about the
    // connection's state, not a server fault. needsReauthorization is the field
    // that tells the operator whether to call the merchant.
    return NextResponse.json(
      {
        error: result.message,
        reason: result.reason,
        needsReauthorization: result.needsReauthorization,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    brand: result.brandSlug,
    shopName: result.shopName,
    firstEverRefresh: result.firstEverRefresh,
    previousAccessTokenExpiresAt: result.previousAccessTokenExpiresAt,
    accessTokenExpiresAt: result.accessTokenExpiresAt,
    refreshTokenExpiresAt: result.refreshTokenExpiresAt,
  });
}
