/**
 * POST /api/tiktok/connections/confirm — the human decision that actually
 * creates a connection.
 *
 * WHY THIS STEP IS NOT OPTIONAL, even when exactly one shop came back:
 * a seller account can own several shops (LeeFar owns three), and the shops
 * endpoint returns whatever that account can reach — not what the operator
 * meant. Auto-linking guesses which storefront a brand is, and a wrong guess is
 * silent: the tokens work, the ingest succeeds, and every GMV number for that
 * client is another shop's. There is no error to notice and no signal to
 * reconcile against. So a person names the shop, every time.
 *
 * This route never decrypts. It copies the pending ciphertext into the
 * connection row verbatim; decryption lives only in lib/tiktok/connections.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { assertNotImpersonating } from '@/lib/auth/platform-admin';
import { getBrandRegistry } from '@/lib/data/brand-registry';
import { resolveExplicitBrandSlug } from '@/lib/tiktok/brand-resolution';
import { hasActiveConnection, saveConfirmedConnection } from '@/lib/tiktok/connections';
import { clearPendingAuthorization, getPendingAuthorization } from '@/lib/tiktok/oauth-state';

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
      state?: unknown;
      shopId?: unknown;
      replace?: unknown;
    };
    const state = typeof body.state === 'string' ? body.state.trim() : '';
    const shopId = typeof body.shopId === 'string' ? body.shopId.trim() : '';
    const replace = body.replace === true;

    if (!state) return NextResponse.json({ error: 'No authorization selected.' }, { status: 400 });
    if (!shopId) return NextResponse.json({ error: 'Pick which shop to link.' }, { status: 400 });

    const pending = await getPendingAuthorization(state);
    if (!pending) {
      return NextResponse.json(
        {
          error:
            'That authorization has expired or was already used. Start the connection again from Settings.',
          reason: 'pending_expired',
        },
        { status: 410 },
      );
    }

    // The shop must be one TikTok actually returned for this authorization —
    // never an id the client supplied on its own.
    const shop = pending.shops.find((s) => s.id === shopId);
    if (!shop) {
      return NextResponse.json(
        { error: 'That shop was not part of this authorization. Refresh and try again.' },
        { status: 400 },
      );
    }

    // Re-validate the slug even though start/ already did: the row has been
    // sitting in the DB across a network round trip, and a brand can be turned
    // into an umbrella in between. The migration-115 trigger is the final guard
    // (see saveConfirmedConnection's error mapping); this just produces the
    // better message.
    const registry = await getBrandRegistry();
    const resolved = resolveExplicitBrandSlug(registry, pending.brandSlug);
    if (!resolved.ok) {
      return NextResponse.json(
        { error: resolved.message, reason: resolved.reason, candidates: resolved.candidates ?? [] },
        { status: 400 },
      );
    }

    // start/ refuses a second connect for a live brand without reconnect:true,
    // but THIS is the step that writes, and saveConfirmedConnection upserts ON
    // CONFLICT (brand_slug) — so without a guard here a stale pending
    // authorization silently rebinds a live brand to a different shop, tokens
    // and all. Two pending authorizations can coexist (an operator double-clicks
    // Connect before any connection exists), so start/'s check is not enough.
    const live = await hasActiveConnection(resolved.brandSlug);
    if (live && live.shopId !== shop.id && !replace) {
      return NextResponse.json(
        {
          error:
            `"${resolved.brandSlug}" is currently linked to ${live.shopName ?? `shop ${live.shopId}`}. ` +
            `Confirming replaces that link, and every number for this brand will come from the new shop.`,
          reason: 'already_connected',
          requiresReplace: true,
          currentShopId: live.shopId,
          currentShopName: live.shopName,
        },
        { status: 409 },
      );
    }

    const saved = await saveConfirmedConnection({
      brandSlug: resolved.brandSlug,
      shopId: shop.id,
      shopCipher: shop.cipher,
      shopName: shop.name,
      sellerBaseRegion: shop.region,
      openId: pending.openId,
      sellerName: pending.sellerName,
      accessTokenEncrypted: pending.accessTokenEncrypted,
      refreshTokenEncrypted: pending.refreshTokenEncrypted,
      accessTokenExpiresAt: pending.accessTokenExpiresAt,
      refreshTokenExpiresAt: pending.refreshTokenExpiresAt,
    });

    if (!saved.ok) {
      // Pending data is intentionally LEFT in place: the operator may have
      // picked the wrong shop of several, and clearing it would force the
      // merchant through consent again to fix a one-click mistake.
      return NextResponse.json({ error: saved.message }, { status: 409 });
    }

    // The connection is already saved, so a failure to erase must not fail the
    // request — but it must be loud: it would mean a merchant token is still
    // parked in tiktok_oauth_states. The pg_cron sweep is the backstop.
    const cleared = await clearPendingAuthorization(state);
    if (!cleared) {
      console.error(
        `[tiktok/connect] confirmed "${resolved.brandSlug}" but the pending row was not cleared; ` +
          `the sweep must erase it`,
      );
    }

    return NextResponse.json({
      brandSlug: resolved.brandSlug,
      shopId: shop.id,
      shopName: shop.name,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[tiktok/connect] confirm failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
