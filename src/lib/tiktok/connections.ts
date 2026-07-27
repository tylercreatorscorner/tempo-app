/**
 * The live connection: hand out a TikTok client that is ready to call, keeping
 * the stored token pair valid underneath it.
 *
 * THIS IS THE ONLY MODULE THAT DECRYPTS. Everything upstream of a connection
 * (the callback, the confirm step) moves ciphertext around without ever looking
 * inside it. Keeping decryption to one file means the answer to "where could a
 * plaintext merchant token appear?" is a single import graph, not a search.
 *
 * Node-only (node:crypto via ./token-crypto and ./client's signing). Service-role
 * only — tiktok_shop_connections is RLS-on with no policy.
 *
 * There is deliberately no ingestion here. This module vends a client and keeps
 * it authenticated; what to ask for is the next phase's problem, written against
 * captured real responses.
 */
import { createAdminClient } from '@/lib/supabase/server';
import {
  TikTokAuthError,
  TikTokClient,
  TikTokPermanentError,
  refreshToken as mintFromRefreshToken,
} from './client';
import { decryptToken, encryptToken, isEncryptedEnvelope, isTokenEncryptionConfigured } from './token-crypto';

/**
 * Refresh this far ahead of expiry rather than at it. A token that is valid
 * "now" can still be expired by the time a long ingestion run reaches its last
 * page, and the retry path is a fallback, not a plan.
 */
const ACCESS_TOKEN_REFRESH_SKEW_MS = 15 * 60_000;

/** Below this, the refresh token itself is too close to dead to bet a run on. */
const REFRESH_TOKEN_MIN_REMAINING_MS = 60_000;

/** last_error is an operator-facing breadcrumb, not a log sink. */
const MAX_STORED_ERROR_CHARS = 500;

export type ConnectionFailureReason =
  /** Env is missing or malformed; nothing about this brand is wrong. */
  | 'not_configured'
  /** No active connection row for this brand. */
  | 'not_connected'
  /** The REFRESH token is gone. Only a human re-authorizing fixes this. */
  | 'reauthorization_required'
  /** TikTok was unreachable or 5xx'd during refresh. Retryable. */
  | 'refresh_failed'
  /** Stored ciphertext will not decrypt — wrong key, or tampering. */
  | 'decrypt_failed';

export interface ConnectionFailure {
  ok: false;
  reason: ConnectionFailureReason;
  /** Safe to show an operator: no tokens, no secrets, no stack. */
  message: string;
  /** True when the fix is "reconnect this brand in Settings", so callers can
   *  route the operator somewhere useful instead of printing a stack trace. */
  needsReauthorization: boolean;
}

export interface ActiveConnection {
  ok: true;
  /** Pre-scoped with this shop's cipher and a refresh-on-401 hook. */
  client: TikTokClient;
  connectionId: string;
  brandSlug: string;
  shopId: string;
  shopCipher: string;
  shopName: string | null;
}

export type ConnectionResult = ActiveConnection | ConnectionFailure;

/** Non-secret projection for the admin surface. */
export interface ConnectionStatus {
  brandSlug: string;
  shopId: string;
  shopName: string | null;
  sellerName: string | null;
  sellerBaseRegion: string | null;
  isActive: boolean;
  connectedAt: string | null;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  lastTokenRefresh: string | null;
  lastApiCall: string | null;
  lastError: string | null;
}

interface ConnectionRow {
  id: string;
  brand_slug: string;
  shop_id: string;
  shop_cipher: string;
  shop_name: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  access_token_expires_at: string;
  refresh_token_expires_at: string;
}

const LIVE_COLUMNS =
  'id, brand_slug, shop_id, shop_cipher, shop_name, access_token_encrypted, ' +
  'refresh_token_encrypted, access_token_expires_at, refresh_token_expires_at';

const STATUS_COLUMNS =
  'brand_slug, shop_id, shop_name, seller_name, seller_base_region, is_active, connected_at, ' +
  'access_token_expires_at, refresh_token_expires_at, last_token_refresh, last_api_call, last_error';

/**
 * Get a client that can call TikTok for this brand, refreshing first if the
 * access token is close to expiring.
 *
 * Returns a typed failure rather than throwing for every expected condition —
 * "this brand was never connected" and "the merchant's authorization lapsed"
 * are states an operator can act on, and a caller that has to pattern-match on
 * error message strings will get it wrong. A genuinely unexpected failure (the
 * DB read itself) still throws.
 */
export async function getActiveConnection(brandSlug: string): Promise<ConnectionResult> {
  const slug = (brandSlug ?? '').trim();
  if (!slug) {
    return fail('not_connected', 'No brand slug supplied.', false);
  }

  if (!isTokenEncryptionConfigured()) {
    return fail(
      'not_configured',
      'TIKTOK_TOKEN_ENC_KEY is missing or malformed, so stored tokens cannot be read. ' +
        'This is a deployment problem, not a merchant one.',
      false,
    );
  }

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('tiktok_shop_connections')
    .select(LIVE_COLUMNS)
    .eq('brand_slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  // A failed READ is not an absence. Collapsing it into 'not_connected' would
  // tell a caller that a live merchant is unconnected, which downstream reads
  // as "no data" — the same class of lie as rendering $0 for a failed money read.
  if (error) {
    throw new Error(`[tiktok/connections] read failed for "${slug}": ${error.message}`);
  }

  const row = data as ConnectionRow | null;
  if (!row) {
    return fail(
      'not_connected',
      `No active TikTok Shop connection for "${slug}". Connect it in Settings, under Data Sources.`,
      true,
    );
  }

  if (!row.access_token_encrypted || !row.refresh_token_encrypted) {
    return fail(
      'reauthorization_required',
      `The connection for "${slug}" has no stored tokens (it was disconnected). Reconnect the brand.`,
      true,
    );
  }

  const refreshExpiresAt = Date.parse(row.refresh_token_expires_at);
  if (!Number.isFinite(refreshExpiresAt) || refreshExpiresAt - Date.now() <= REFRESH_TOKEN_MIN_REMAINING_MS) {
    // The refresh token is the root of the chain: once it is gone there is no
    // programmatic way back, so this must never surface as a generic throw that
    // a retry loop will keep grinding against.
    const message =
      `The TikTok authorization for "${slug}" has expired and cannot be renewed automatically. ` +
      `The merchant must re-authorize: reconnect the brand in Settings.`;
    await recordConnectionError(row.id, message);
    return fail('reauthorization_required', message, true);
  }

  let accessToken: string;
  try {
    accessToken = decryptToken(row.access_token_encrypted);
  } catch {
    const message =
      `Stored TikTok tokens for "${slug}" could not be decrypted (TIKTOK_TOKEN_ENC_KEY changed, ` +
      `or the stored value was tampered with). Reconnect the brand to re-issue them.`;
    await recordConnectionError(row.id, message);
    return fail('decrypt_failed', message, true);
  }

  const accessExpiresAt = Date.parse(row.access_token_expires_at);
  if (!Number.isFinite(accessExpiresAt) || accessExpiresAt - Date.now() <= ACCESS_TOKEN_REFRESH_SKEW_MS) {
    const rotated = await rotateTokens(row);
    if (!rotated.ok) return rotated;
    accessToken = rotated.accessToken;
  }

  const client = new TikTokClient({
    accessToken,
    shopCipher: row.shop_cipher,
    // Second line of defense: TikTok can reject a token we believed was fresh
    // (revoked seller-side, scope change, clock skew). One rotation, then the
    // client gives up — see TikTokClient.request.
    onTokenExpired: async () => {
      const rotated = await rotateTokens(row);
      return rotated.ok ? rotated.accessToken : null;
    },
  });

  // Deliberately NOT touchApiCall() here.
  //
  // It used to stamp on hand-out, reasoning that "a live client was issued" is
  // the honest thing this module knows. In practice that reads as a claim the
  // panel cannot support: the first real test showed "Last API call: 3:25 PM"
  // for a connection whose only scoped request had just 403'd. Obtaining a
  // client is not making a call. Callers stamp it when a request returns.

  return {
    ok: true,
    client,
    connectionId: row.id,
    brandSlug: row.brand_slug,
    shopId: row.shop_id,
    shopCipher: row.shop_cipher,
    shopName: row.shop_name,
  };
}

/**
 * Trade the refresh token for a new pair and persist both.
 *
 * BOTH tokens rotate on TikTok's side, so the old refresh token is dead the
 * instant this succeeds. That makes the row write non-optional: if it fails we
 * have a valid pair in memory and a dead pair on disk, and the only safe report
 * is "this needs re-authorization" — claiming success would leave the next call
 * to fail with no explanation.
 *
 * Mutates `row` on success so a caller that rotates twice in one request (the
 * proactive refresh, then the onTokenExpired hook) uses the NEW refresh token
 * the second time instead of replaying the spent one.
 */
async function rotateTokens(
  row: ConnectionRow,
): Promise<{ ok: true; accessToken: string } | ConnectionFailure> {
  if (!row.refresh_token_encrypted) {
    return fail(
      'reauthorization_required',
      `The connection for "${row.brand_slug}" has no refresh token. Reconnect the brand.`,
      true,
    );
  }

  let currentRefreshToken: string;
  try {
    currentRefreshToken = decryptToken(row.refresh_token_encrypted);
  } catch {
    const message =
      `Stored TikTok refresh token for "${row.brand_slug}" could not be decrypted. Reconnect the brand.`;
    await recordConnectionError(row.id, message);
    return fail('decrypt_failed', message, true);
  }

  let tokens;
  try {
    tokens = await mintFromRefreshToken(currentRefreshToken);
  } catch (err) {
    // Auth/permanent means TikTok rejected the refresh token itself — no amount
    // of retrying changes that. Anything else (5xx, timeout, network) is worth
    // another attempt later, and must NOT be reported as a lapsed authorization
    // or an operator will go chase a merchant for nothing.
    const permanent = err instanceof TikTokAuthError || err instanceof TikTokPermanentError;
    const detail = err instanceof Error ? err.message : String(err);
    const message = permanent
      ? `TikTok rejected the stored refresh token for "${row.brand_slug}". The merchant must re-authorize.`
      : `Could not reach TikTok to refresh the token for "${row.brand_slug}": ${detail}`;
    await recordConnectionError(row.id, message);
    return fail(permanent ? 'reauthorization_required' : 'refresh_failed', message, permanent);
  }

  const accessTokenEncrypted = encryptToken(tokens.accessToken);
  const refreshTokenEncrypted = encryptToken(tokens.refreshToken);

  const supabase = await createAdminClient();
  const { data: written, error } = await supabase
    .from('tiktok_shop_connections')
    .update({
      access_token_encrypted: accessTokenEncrypted,
      refresh_token_encrypted: refreshTokenEncrypted,
      access_token_expires_at: tokens.accessTokenExpiresAt.toISOString(),
      refresh_token_expires_at: tokens.refreshTokenExpiresAt.toISOString(),
      last_token_refresh: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', row.id)
    .select('id');

  // Rowcount, not just `error`: a PostgREST update that matches nothing returns
  // error === null, and here that would mean reporting a successful refresh
  // while the freshly minted pair was never stored and the old refresh token is
  // already dead TikTok-side.
  const savedRows = ((written ?? []) as unknown[]).length;
  if (error || savedRows !== 1) {
    const reason = error ? error.message : 'the connection row no longer exists';
    const message =
      `Refreshed the TikTok token for "${row.brand_slug}" but could not save it (${reason}). ` +
      `The previous token pair is no longer valid — reconnect the brand.`;
    await recordConnectionError(row.id, message);
    return fail('reauthorization_required', message, true);
  }

  row.access_token_encrypted = accessTokenEncrypted;
  row.refresh_token_encrypted = refreshTokenEncrypted;
  row.access_token_expires_at = tokens.accessTokenExpiresAt.toISOString();
  row.refresh_token_expires_at = tokens.refreshTokenExpiresAt.toISOString();

  return { ok: true, accessToken: tokens.accessToken };
}

/**
 * Bookkeeping only — a failure here must never fail the caller's real work, so
 * these two do NOT throw on a zero-row write the way the credential paths do.
 * They still say so out loud: a stamp that matched nothing means the connection
 * id is stale, and silently dropping it would leave Settings showing a
 * last_api_call / last_error that stopped tracking reality.
 */
export async function touchApiCall(connectionId: string): Promise<void> {
  // Clearing last_error is the point, not a side effect. A stale breadcrumb from
  // a call that has since started working is worse than none: it renders in
  // Settings as a live problem and sends an operator chasing a fault that is
  // already fixed. A successful call IS the evidence the previous error is over.
  await stampConnection(
    connectionId,
    { last_api_call: new Date().toISOString(), last_error: '' },
    'last_api_call',
  );
}

/** Leave an operator-readable breadcrumb on the row. Never pass a raw error
 *  object or a response body here — this string is rendered in Settings. */
export async function recordConnectionError(connectionId: string, message: string): Promise<void> {
  await stampConnection(
    connectionId,
    { last_error: message.slice(0, MAX_STORED_ERROR_CHARS) },
    'last_error',
  );
}

async function stampConnection(
  connectionId: string,
  patch: Record<string, string>,
  label: string,
): Promise<void> {
  try {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('tiktok_shop_connections')
      .update(patch)
      .eq('id', connectionId)
      .select('id');

    if (error) {
      console.warn(`[tiktok/connections] ${label} write failed: ${error.message}`);
      return;
    }
    if (((data ?? []) as unknown[]).length === 0) {
      console.warn(`[tiktok/connections] ${label} write matched no connection row (${connectionId})`);
    }
  } catch (err) {
    console.warn(
      `[tiktok/connections] ${label} write failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Every connection, active or not, with no token material. Feeds the admin
 * surface. Throws on a read failure — an empty list must mean "none", not
 * "we could not tell".
 *
 * Not paged, and safe not to be: UNIQUE(brand_slug) caps this table at one row
 * per brand (29 today, and the beta app is capped at 25 authorized sellers), so
 * the PostgREST 1000-row truncation cannot reach it. If connections ever stop
 * being 1:1 with brands, this needs fetchAllRows.
 */
export async function listConnectionStatus(): Promise<ConnectionStatus[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('tiktok_shop_connections')
    .select(STATUS_COLUMNS)
    .order('brand_slug');

  if (error) throw new Error(`[tiktok/connections] status read failed: ${error.message}`);

  // Cast through unknown: this repo has no generated DB types, and supabase-js
  // cannot infer a shape from a select list built by concatenation. The row
  // interface above is the contract; migration 115/117 is its source.
  return ((data ?? []) as unknown as StatusRow[]).map((row) => ({
    brandSlug: row.brand_slug,
    shopId: row.shop_id,
    shopName: row.shop_name,
    sellerName: row.seller_name,
    sellerBaseRegion: row.seller_base_region,
    isActive: row.is_active,
    connectedAt: row.connected_at,
    accessTokenExpiresAt: row.access_token_expires_at,
    refreshTokenExpiresAt: row.refresh_token_expires_at,
    lastTokenRefresh: row.last_token_refresh,
    lastApiCall: row.last_api_call,
    lastError: row.last_error,
  }));
}

interface StatusRow {
  brand_slug: string;
  shop_id: string;
  shop_name: string | null;
  seller_name: string | null;
  seller_base_region: string | null;
  is_active: boolean;
  connected_at: string | null;
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  last_token_refresh: string | null;
  last_api_call: string | null;
  last_error: string | null;
}

/** Does this brand already hold a live connection? Used to refuse a second
 *  connect without an explicit reconnect. */
export async function hasActiveConnection(brandSlug: string): Promise<ConnectionStatus | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('tiktok_shop_connections')
    .select(STATUS_COLUMNS)
    .eq('brand_slug', brandSlug)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw new Error(`[tiktok/connections] active check failed: ${error.message}`);
  if (!data) return null;

  const row = data as unknown as StatusRow;
  return {
    brandSlug: row.brand_slug,
    shopId: row.shop_id,
    shopName: row.shop_name,
    sellerName: row.seller_name,
    sellerBaseRegion: row.seller_base_region,
    isActive: row.is_active,
    connectedAt: row.connected_at,
    accessTokenExpiresAt: row.access_token_expires_at,
    refreshTokenExpiresAt: row.refresh_token_expires_at,
    lastTokenRefresh: row.last_token_refresh,
    lastApiCall: row.last_api_call,
    lastError: row.last_error,
  };
}

export interface SaveConnectionInput {
  brandSlug: string;
  shopId: string;
  shopCipher: string;
  shopName: string | null;
  sellerBaseRegion: string | null;
  openId: string | null;
  sellerName: string | null;
  /** Already-encrypted. This function never sees a plaintext token. */
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

export type SaveConnectionResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Write the confirmed connection. Upserts on brand_slug so a reconnect replaces
 * the brand's row (including one previously disconnected) rather than tripping
 * UNIQUE(brand_slug) — while UNIQUE(shop_id) still catches the genuinely wrong
 * case: the same shop being claimed by a second brand, which would double-count
 * its GMV across the agency.
 */
export async function saveConfirmedConnection(input: SaveConnectionInput): Promise<SaveConnectionResult> {
  if (!isEncryptedEnvelope(input.accessTokenEncrypted) || !isEncryptedEnvelope(input.refreshTokenEncrypted)) {
    // Guards against a refactor that starts handing plaintext down this path.
    // The column name says `_encrypted`; this makes it true.
    throw new Error('[tiktok/connections] refusing to store a token that is not an encryption envelope.');
  }

  const supabase = await createAdminClient();
  const { data: written, error } = await supabase
    .from('tiktok_shop_connections')
    .upsert(
      {
        brand_slug: input.brandSlug,
        shop_id: input.shopId,
        shop_cipher: input.shopCipher,
        shop_name: input.shopName,
        open_id: input.openId,
        seller_name: input.sellerName,
        seller_base_region: input.sellerBaseRegion,
        access_token_encrypted: input.accessTokenEncrypted,
        refresh_token_encrypted: input.refreshTokenEncrypted,
        access_token_expires_at: input.accessTokenExpiresAt,
        refresh_token_expires_at: input.refreshTokenExpiresAt,
        // granted_scopes stays null: the token response carries no scope list,
        // and the shops endpoint does not return one either. Fill it from a
        // captured response rather than asserting scopes we have not observed.
        is_active: true,
        connected_at: new Date().toISOString(),
        last_error: null,
      },
      { onConflict: 'brand_slug' },
    )
    .select('id');

  if (error) return { ok: false, message: await explainWriteFailure(error, input) };

  // Rowcount asserted for the same reason as everywhere else in this flow: a
  // write that silently affected nothing must not be reported as a connection.
  if (((written ?? []) as unknown[]).length !== 1) {
    return { ok: false, message: 'The connection write reported success but stored no row. Try again.' };
  }

  return { ok: true };
}

interface WriteError {
  code?: string;
  message: string;
}

/** Turn a Postgres constraint violation into something an operator can act on.
 *  A raw "duplicate key value violates unique constraint …" is a stack trace
 *  wearing a suit. */
async function explainWriteFailure(error: WriteError, input: SaveConnectionInput): Promise<string> {
  const raw = error.message ?? '';

  if (error.code === '23505' || raw.includes('duplicate key value')) {
    // Matches idx_tiktok_conn_active_shop_id (migration 117), which is PARTIAL
    // on `WHERE is_active` — so reaching here means another brand is claiming
    // this shop RIGHT NOW, not that some disconnected row once did.
    if (raw.includes('shop_id')) {
      const owner = await findBrandForShop(input.shopId);
      return owner && owner !== input.brandSlug
        ? `That TikTok shop is currently linked to "${owner}". Disconnect "${owner}" first, then link the shop here.`
        : 'That TikTok shop is currently linked to another brand in Tempo.';
    }
    if (raw.includes('brand_slug')) {
      return `"${input.brandSlug}" already has a TikTok Shop connection. Disconnect it before connecting a different shop.`;
    }
    return 'That connection conflicts with one that already exists.';
  }

  // The migration-115 trigger raises these. They mean the slug is an umbrella or
  // not in brands_v2 at all — the failure this whole design exists to prevent.
  if (raw.includes('is an UMBRELLA')) {
    return `"${input.brandSlug}" is an umbrella brand. A TikTok shop maps to one store slug; pick the specific store.`;
  }
  if (raw.includes('is not a brands_v2 slug')) {
    return `"${input.brandSlug}" is not a brand in brands_v2. Add the brand before connecting its shop.`;
  }
  if (raw.includes('tiktok_conn_active_has_tokens')) {
    return 'Refused to save an active connection with no tokens. Start the connection again.';
  }

  return `Could not save the connection: ${raw}`;
}

/** The brand LIVE-claiming this shop, if any.
 *
 *  is_active is load-bearing twice over. It keeps the conflict message honest —
 *  naming a brand the operator already disconnected is what made the old dead
 *  end so confusing. And since migration 117 the unique index is partial, so
 *  several INACTIVE rows may share a shop_id; without the filter maybeSingle()
 *  would error on them and degrade every message to the generic one. */
async function findBrandForShop(shopId: string): Promise<string | null> {
  try {
    const supabase = await createAdminClient();
    const { data } = await supabase
      .from('tiktok_shop_connections')
      .select('brand_slug')
      .eq('shop_id', shopId)
      .eq('is_active', true)
      .maybeSingle();
    return (data as { brand_slug: string } | null)?.brand_slug ?? null;
  } catch {
    return null;
  }
}

/**
 * Disconnect: stop using the connection AND destroy the credential.
 *
 * Deactivating alone would leave a live merchant OAuth token sitting in a row
 * nothing reads and nobody watches — the tokens are nulled in the same
 * statement so a "disconnected" brand really is disconnected. The row itself
 * survives so connected_at / last_error stay auditable.
 *
 * This revokes Tempo's ability to call; it does not revoke the grant on
 * TikTok's side. The merchant removes the app in Seller Center for that, and
 * doing so simply makes these tokens fail — which is why erasing them here is
 * the part that matters.
 */
export async function deactivateConnection(brandSlug: string): Promise<SaveConnectionResult> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('tiktok_shop_connections')
    .update({
      is_active: false,
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      last_error: null,
    })
    .eq('brand_slug', brandSlug)
    .select('brand_slug');

  if (error) return { ok: false, message: `Could not disconnect "${brandSlug}": ${error.message}` };

  const rows = (data ?? []) as Array<{ brand_slug: string }>;
  if (rows.length === 0) return { ok: false, message: `No TikTok Shop connection found for "${brandSlug}".` };

  return { ok: true };
}

function fail(
  reason: ConnectionFailureReason,
  message: string,
  needsReauthorization: boolean,
): ConnectionFailure {
  return { ok: false, reason, message, needsReauthorization };
}
