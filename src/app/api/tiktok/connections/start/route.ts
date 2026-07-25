/**
 * POST /api/tiktok/connections/start — begin connecting ONE brand.
 *
 * Returns the authorize URL for the operator to follow; it does not redirect,
 * so the caller can show the refusal reasons below instead of bouncing a human
 * into a TikTok page that was never going to work.
 *
 * Auth is the repo's normal admin idiom (requireAdmin + assertNotImpersonating).
 * Notably NOT a bearer token: the previous /api/tiktok/sync accepted the
 * service-role key in an Authorization header, which turned the app's most
 * privileged credential into an API password and put it in every caller's
 * config. It was deleted for that reason and is not coming back.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { assertNotImpersonating } from '@/lib/auth/platform-admin';
import { getBrandRegistry } from '@/lib/data/brand-registry';
import { resolveExplicitBrandSlug } from '@/lib/tiktok/brand-resolution';
import { buildAuthorizeUrl, checkConnectPreflight } from '@/lib/tiktok/authorize';
import { hasActiveConnection } from '@/lib/tiktok/connections';
import { createOauthState, sweepOauthStates } from '@/lib/tiktok/oauth-state';

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
    const body = (await request.json().catch(() => ({}))) as {
      brandSlug?: unknown;
      reconnect?: unknown;
    };
    const brandSlug = typeof body.brandSlug === 'string' ? body.brandSlug.trim() : '';
    const reconnect = body.reconnect === true;

    // Preflight BEFORE anything else. Every one of these failures only becomes
    // visible at the far end of the round trip, after the merchant has already
    // granted access and the single-use auth_code has been spent.
    const preflight = checkConnectPreflight();
    if (!preflight.ok) {
      return NextResponse.json({ error: preflight.message }, { status: 503 });
    }

    // Resolve BEFORE creating any state: an umbrella or unknown slug must never
    // get as far as a nonce, let alone a merchant consent screen. There is no
    // fallback in brand-resolution and none is added here — a shop written under
    // an umbrella slug produces fact-table rows no read path will ever select.
    const registry = await getBrandRegistry();
    const resolved = resolveExplicitBrandSlug(registry, brandSlug);
    if (!resolved.ok) {
      return NextResponse.json(
        { error: resolved.message, reason: resolved.reason, candidates: resolved.candidates ?? [] },
        { status: 400 },
      );
    }

    const existing = await hasActiveConnection(resolved.brandSlug);
    if (existing && !reconnect) {
      return NextResponse.json(
        {
          error:
            `"${resolved.brandSlug}" is already connected to ${existing.shopName ?? `shop ${existing.shopId}`}. ` +
            `Reconnecting replaces that link.`,
          reason: 'already_connected',
          requiresReconnect: true,
        },
        { status: 409 },
      );
    }

    await sweepOauthStates();
    const state = await createOauthState(resolved.brandSlug);

    return NextResponse.json({
      brandSlug: resolved.brandSlug,
      authorizeUrl: buildAuthorizeUrl(preflight.serviceId, state),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[tiktok/connect] start failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
