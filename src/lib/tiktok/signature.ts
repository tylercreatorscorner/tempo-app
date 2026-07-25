/**
 * TikTok Shop request signing. Pure — no I/O, no env, no fetch — so it is
 * testable to certainty offline: scripts/test-tiktok-signature.ts freezes
 * fixture digests, and if you change the algorithm those must fail.
 */
import { createHmac } from 'node:crypto';

/**
 * Query params that are carried on the request but NEVER participate in the
 * signature. `sign` is the output itself; the access token is transport auth
 * and signing it produces a valid-looking digest the API rejects.
 */
const UNSIGNED_PARAMS = new Set(['sign', 'access_token', 'x-tts-access-token']);

export interface SignRequestInput {
  appSecret: string;
  /** Request path only, e.g. `/authorization/202309/shops` — no host, no query. */
  path: string;
  /** Every query param that will be sent, including `shop_cipher` and `timestamp`. */
  params: Record<string, string>;
  /** The exact serialized body bytes that will be sent, if any. */
  body?: string;
  /** Defaults to GET. */
  method?: string;
  /** Request Content-Type, if any. */
  contentType?: string;
}

/**
 * Build the TikTok signature, hex-encoded:
 *   1. take the query params, excluding `sign` / `access_token` / `x-tts-access-token`
 *   2. sort the remaining keys alphabetically
 *   3. concatenate as {key}{value} with no separators
 *   4. prepend the request path
 *   5. append the raw body when the method is not GET and the type is not multipart
 *   6. wrap the whole string in appSecret on both ends
 *   7. HMAC-SHA256 keyed with appSecret
 */
export function signRequest({
  appSecret,
  path,
  params,
  body,
  method = 'GET',
  contentType,
}: SignRequestInput): string {
  if (!appSecret) throw new Error('signRequest: appSecret is required');
  if (!path.startsWith('/')) throw new Error(`signRequest: path must start with "/" (got "${path}")`);

  // 1 + 2
  const signedKeys = Object.keys(params)
    .filter((key) => !UNSIGNED_PARAMS.has(key))
    .sort();

  // 3
  let signString = signedKeys.map((key) => `${key}${params[key]}`).join('');

  // 4
  signString = `${path}${signString}`;

  // 5 — a multipart body is streamed, so its bytes are not part of the digest.
  const isMultipart = (contentType ?? '').toLowerCase().includes('multipart/form-data');
  if (body && method.toUpperCase() !== 'GET' && !isMultipart) {
    signString = `${signString}${body}`;
  }

  // 6
  signString = `${appSecret}${signString}${appSecret}`;

  // 7
  return createHmac('sha256', appSecret).update(signString, 'utf8').digest('hex');
}
