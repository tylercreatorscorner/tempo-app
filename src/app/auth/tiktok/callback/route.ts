/**
 * GET /auth/tiktok/callback — the redirect target registered in TikTok Partner
 * Center (https://app.tempoapp.ai/auth/tiktok/callback). The path is fixed by
 * that registration: TikTok does not accept a redirect_uri parameter, it uses
 * the one on the app. Moving this file breaks the flow with no error anywhere.
 *
 * REACHABILITY. This path is listed in PUBLIC_PATHS in lib/supabase/middleware
 * and it has to be. `/auth/callback` (Supabase) was already public, but that
 * list is matched with startsWith and '/auth/tiktok/callback' does not start
 * with '/auth/callback' — so without its own entry the auth guard 307s this
 * request to /login BEFORE the handler runs, and the auth_code (single use) is
 * gone. That failure mode has bitten this repo twice on cron paths.
 *
 * It also must be public for a second reason: the browser completing the
 * consent may be the MERCHANT'S, not the operator's, and that browser has no
 * Tempo session. Requiring one here would strand a legitimate authorization.
 *
 * AUTHENTICATION, then, is the state nonce: 32 CSPRNG bytes we issued, stored
 * server-side, redeemable exactly once inside ten minutes. Nothing else in this
 * request is trusted. And crucially this route WRITES NO CONNECTION — it parks
 * an encrypted pending authorization that an authenticated admin must then
 * confirm (see api/tiktok/connections/confirm). So the worst an attacker who
 * somehow held a live state could achieve is putting a shop in front of an
 * operator who has to look at it and click.
 *
 * Never logs or renders an access token, a refresh token, the app secret, or a
 * token/authorize URL.
 */
import { NextResponse } from 'next/server';
import { exchangeAuthCode, TikTokError } from '@/lib/tiktok/client';
import { fetchAuthorizedShops } from '@/lib/tiktok/authorize';
import { isTokenEncryptionConfigured } from '@/lib/tiktok/token-crypto';
import { claimOauthState, storePendingAuthorization } from '@/lib/tiktok/oauth-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Where the operator finishes the job. The fragment scrolls to the panel. */
const ADMIN_SURFACE = '/settings';
const PANEL_ANCHOR = 'tiktok-shop';

/**
 * Outcomes travel as short codes, not sentences: the settings panel owns the
 * wording (so it can be edited without touching this route), and a URL is a bad
 * place for anything that might one day carry detail from an error.
 */
type CallbackOutcome =
  | 'pending'
  | 'missing_state'
  | 'invalid_state'
  | 'denied'
  | 'not_configured'
  | 'exchange_failed'
  | 'shops_failed'
  | 'no_shops'
  | 'store_failed';

export async function GET(request: Request) {
  const url = new URL(request.url);
  // Normalized ONCE, here at the boundary. Downstream writes then use the
  // canonical value the claim returned, so a state that differs only by
  // surrounding whitespace cannot claim a row and then update none.
  const state = (url.searchParams.get('state') ?? '').trim();
  // TikTok's redirect carries `code`; some of the vendor's own docs and SDKs
  // call the same value `auth_code`. Accept either rather than losing a
  // single-use credential to a naming difference.
  const authCode = url.searchParams.get('code') ?? url.searchParams.get('auth_code') ?? '';
  const vendorError = url.searchParams.get('error');

  if (!state) return outcome(request, 'missing_state');

  // Claim first, and claim even when the merchant declined: that round trip is
  // over either way, and a nonce left unspent is a nonce that can be replayed.
  let claimed;
  try {
    claimed = await claimOauthState(state);
  } catch (err) {
    console.error(`[tiktok/callback] state claim failed: ${message(err)}`);
    return outcome(request, 'invalid_state');
  }
  if (!claimed.ok) return outcome(request, 'invalid_state');

  if (vendorError || !authCode) return outcome(request, 'denied');

  // Re-checked here as well as in start/: the deployment could have lost the
  // key while the merchant was on the consent screen, and accepting a token we
  // cannot encrypt would mean writing a plaintext credential.
  if (!isTokenEncryptionConfigured()) {
    console.error('[tiktok/callback] refusing the token exchange: TIKTOK_TOKEN_ENC_KEY is missing or malformed');
    return outcome(request, 'not_configured');
  }

  let tokens;
  try {
    tokens = await exchangeAuthCode(authCode);
  } catch (err) {
    console.error(`[tiktok/callback] token exchange failed for "${claimed.brandSlug}": ${describe(err)}`);
    return outcome(request, 'exchange_failed');
  }

  // The cipher exists nowhere else — not in the token response, not derivable.
  // Without this call there is nothing to confirm and nothing that could ever
  // make a Shop API request.
  let shopsResult;
  try {
    shopsResult = await fetchAuthorizedShops(tokens.accessToken);
  } catch (err) {
    // Deliberately terse: a shops response body carries shop ciphers, and the
    // client's error messages can quote a response body.
    console.error(`[tiktok/callback] shops lookup failed for "${claimed.brandSlug}": ${describe(err)}`);
    return outcome(request, 'shops_failed');
  }

  if (shopsResult.shops.length === 0) {
    console.error(`[tiktok/callback] no usable shops returned for "${claimed.brandSlug}"`);
    return outcome(request, 'no_shops');
  }

  try {
    await storePendingAuthorization({
      // The state as the DB stored it, not as the query string spelled it.
      state: claimed.state,
      tokens,
      shopsPayload: shopsResult.raw,
    });
  } catch (err) {
    console.error(`[tiktok/callback] could not park the pending authorization: ${message(err)}`);
    return outcome(request, 'store_failed');
  }

  // No connection has been written. An admin confirms which shop maps to
  // "${claimed.brandSlug}" in Settings; the confirm screen is rendered there
  // rather than inline here so it uses the real component kit and themes.
  return outcome(request, 'pending');
}

function outcome(request: Request, result: CallbackOutcome): NextResponse {
  const target = new URL(ADMIN_SURFACE, request.url);
  target.searchParams.set(result === 'pending' ? 'tiktok' : 'tiktok_error', result);
  target.hash = PANEL_ANCHOR;
  return NextResponse.redirect(target);
}

/** Error identity without the body. TikTokError already redacts credentials
 *  from token-endpoint messages, but a shops failure can quote a response, so
 *  only the classification is logged. */
function describe(err: unknown): string {
  if (err instanceof TikTokError) {
    return `${err.name} status=${err.status} code=${err.code ?? 'none'} request_id=${err.requestId ?? 'none'}`;
  }
  return err instanceof Error ? err.name : 'UnknownError';
}

/** For our OWN errors (DB, config), where the message is ours and safe. */
function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
