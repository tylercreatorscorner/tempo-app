/**
 * The authorization (connect) round trip: build the merchant-facing authorize
 * URL, and read back which shops the resulting token can actually reach.
 *
 * Node-only (node:crypto, and ./client's signing) — import from route handlers
 * on the nodejs runtime, never from an edge function or a client bundle.
 *
 * No DB access here on purpose: this module is the protocol, ./oauth-state.ts
 * is the storage, and ./connections.ts is the live token lifecycle.
 */
import { randomBytes } from 'node:crypto';
import { TikTokClient } from './client';
import { isTokenEncryptionConfigured } from './token-crypto';

/**
 * US market authorize host. This is NOT the same host as the API or the auth
 * host in ./client — TikTok uses three, and sending a merchant to the wrong one
 * produces a page that looks plausible and never returns an auth_code.
 * A non-US market would need its own regional host; there is exactly one market
 * (US) configured on the "Tempo" app today, so no lookup table is invented here.
 */
const AUTHORIZE_URL = 'https://services.us.tiktokshop.com/open/authorize';

/**
 * Version segment for the shop-discovery endpoint.
 *
 * 202309 is chosen because it is the version the vendor documents for
 * "Get Authorized Shops" and the one this repo's client was written against
 * (see the `path` example in TikTokClient.request). It also has to be a
 * six-digit segment to match the client's SHOP_AGNOSTIC_PATH guard, which is
 * what stops `shop_cipher` being injected into the very call whose job is to
 * GO AND FETCH the cipher — a request that cannot succeed before a connection
 * exists. Change this only alongside a captured response from the new version.
 */
export const AUTHORIZATION_VERSION = '202309';
export const AUTHORIZED_SHOPS_PATH = `/authorization/${AUTHORIZATION_VERSION}/shops`;

/** 32 bytes of CSPRNG entropy. This nonce is the ONLY thing that authenticates
 *  an inbound callback, so it is generated here and nowhere else — never from
 *  a uuid, a timestamp, or Math.random. */
export function generateOauthState(): string {
  return randomBytes(32).toString('base64url');
}

export type ConnectPreflight =
  | { ok: true; serviceId: string }
  | { ok: false; message: string };

/**
 * Refuse to start a round trip that cannot be finished.
 *
 * Every one of these failures is invisible until the very END of the flow —
 * after the merchant has already granted access — and by then the auth_code is
 * spent and they have to be asked to do it again. Checking up front turns a
 * embarrassing dead end into a one-line operator message.
 */
export function checkConnectPreflight(): ConnectPreflight {
  const missing: string[] = [];

  const serviceId = (process.env.TIKTOK_SERVICE_ID ?? '').trim();
  if (!serviceId) missing.push('TIKTOK_SERVICE_ID');
  if (!(process.env.TIKTOK_APP_KEY ?? '').trim()) missing.push('TIKTOK_APP_KEY');
  if (!(process.env.TIKTOK_APP_SECRET ?? '').trim()) missing.push('TIKTOK_APP_SECRET');

  if (missing.length > 0) {
    return {
      ok: false,
      message:
        `TikTok Shop is not configured on this deployment: ${missing.join(', ')} ` +
        `${missing.length === 1 ? 'is' : 'are'} missing. Set ${missing.length === 1 ? 'it' : 'them'} in the environment and redeploy.`,
    };
  }

  // Separate from the env list above because the failure mode is different: the
  // key can be PRESENT and still unusable (wrong length, hex instead of base64),
  // and a token we cannot encrypt is a token we must not accept.
  if (!isTokenEncryptionConfigured()) {
    return {
      ok: false,
      message:
        'TIKTOK_TOKEN_ENC_KEY is missing or malformed, so the merchant tokens could not be ' +
        'stored safely. Generate one with: openssl rand -base64 32',
    };
  }

  return { ok: true, serviceId };
}

/**
 * The URL the merchant is sent to.
 *
 * Shape: https://services.us.tiktokshop.com/open/authorize?service_id=…&state=…
 * `service_id` (not app_key) is what the authorize page keys on, and `state` is
 * echoed back to the redirect URL configured in Partner Center. The redirect
 * URI is NOT a parameter here — TikTok uses the one registered on the app, which
 * is why the callback route has to live at exactly the registered path.
 */
export function buildAuthorizeUrl(serviceId: string, state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('service_id', serviceId);
  url.searchParams.set('state', state);
  return url.toString();
}

export interface AuthorizedShop {
  /** TikTok shop id. */
  id: string;
  /** Per-shop cipher, required on every subsequent Shop API call. */
  cipher: string;
  name: string | null;
  region: string | null;
  code: string | null;
}

export interface AuthorizedShopsResult {
  shops: AuthorizedShop[];
  /** The envelope's `data`, verbatim, for storage and later type generation. */
  raw: unknown;
}

/**
 * The ONLY way to obtain a shop_cipher. It is not in the token response and not
 * derivable — it comes back from this endpoint and nowhere else, which is why
 * the callback has to make this call before it can offer the operator anything
 * to confirm.
 */
export async function fetchAuthorizedShops(accessToken: string): Promise<AuthorizedShopsResult> {
  // No shopCipher: we are here to find out what it is. The client would strip it
  // from this path anyway, but not passing it keeps the intent obvious.
  const client = new TikTokClient({ accessToken });
  const { data } = await client.get<unknown>(AUTHORIZED_SHOPS_PATH);
  return { shops: parseAuthorizedShops(data), raw: data ?? null };
}

/**
 * Read shops out of an unverified payload.
 *
 * Tolerant by design. The response shape has never been observed live from this
 * account, so this accepts both the documented `{ shops: [...] }` wrapper and a
 * bare array, and both the documented field names and their `shop_*` variants.
 * A row without an id or a cipher is DROPPED rather than half-built: a shop we
 * cannot address is not a shop we can offer to link, and an entry with a
 * missing cipher would produce a connection that fails on its first API call.
 */
export function parseAuthorizedShops(payload: unknown): AuthorizedShop[] {
  const list = extractShopList(payload);
  const shops: AuthorizedShop[] = [];
  const seen = new Set<string>();

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;

    const pick = (...keys: string[]): string | null => {
      for (const key of keys) {
        const value = row[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
      return null;
    };

    const id = pick('id', 'shop_id');
    const cipher = pick('cipher', 'shop_cipher');
    if (!id || !cipher || seen.has(id)) continue;
    seen.add(id);

    shops.push({
      id,
      cipher,
      name: pick('name', 'shop_name'),
      region: pick('region', 'shop_region', 'seller_base_region'),
      code: pick('code', 'shop_code'),
    });
  }

  return shops;
}

function extractShopList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const shops = (payload as Record<string, unknown>).shops;
    if (Array.isArray(shops)) return shops;
  }
  return [];
}
