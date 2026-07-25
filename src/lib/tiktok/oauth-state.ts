/**
 * Lifecycle of the OAuth state nonce and the pending authorization it carries.
 *
 * The nonce is the only thing that authenticates an inbound callback: the
 * redirect arrives from TikTok's servers with no session, no signature and no
 * shared secret, so "did we issue this state?" is the entire authenticity
 * check. Everything here exists to keep that check honest — issued once,
 * redeemable once, short-lived, and never inferred from anything the caller
 * sent us.
 *
 * Service-role only (both tables are RLS-on with no policy, migrations 115/117).
 */
import { createAdminClient } from '@/lib/supabase/server';
import { encryptToken, isEncryptedEnvelope } from './token-crypto';
import { generateOauthState, parseAuthorizedShops, type AuthorizedShop } from './authorize';
import { inviteConfirmDeadline } from './connect-invites-core';
import type { TikTokTokens } from './types';

/**
 * How long an operator has to pick a shop after the merchant consents, when the
 * ADMIN did the authorizing. Short, because the row holds encrypted merchant
 * tokens for the whole window; long enough that reading three shop names and
 * clicking one is not a race. Both halves of that flow happen in one sitting,
 * so fifteen minutes is generous.
 */
const ADMIN_CONFIRM_WINDOW_MS = 15 * 60_000;

/**
 * The ceiling for an authorization that came from a CLIENT CONNECT LINK, where
 * the two halves are hours or days apart by design: the client clicks at 8am
 * and the operator may not open Settings until lunch. Fifteen minutes there
 * means the sweep erases the tokens before anyone can act, and the client
 * authorized for nothing.
 *
 * Longer is a POLICY choice, not a weakened one: the parked pair is AES-256-GCM
 * ciphertext (./token-crypto) in a service-role-only, RLS-on table, keyed from
 * the environment. The window buys exposure TIME, and the trade is explicit.
 * The erase itself is unchanged — the sweep still fires at whatever deadline
 * the row carries, so an abandoned authorization is still erased.
 */
const INVITE_CONFIRM_MAX_MS = 72 * 3_600_000;

export interface PendingAuthorization {
  state: string;
  brandSlug: string;
  shops: AuthorizedShop[];
  sellerName: string | null;
  openId: string | null;
  pendingExpiresAt: string;
}

/** Everything the confirm step needs, including the ciphertext it will copy
 *  into the connection row. Deliberately never decrypted here — decryption
 *  happens in exactly one module (./connections.ts). */
export interface PendingAuthorizationWithTokens extends PendingAuthorization {
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

/**
 * Issue a nonce for one brand. The brand is decided BEFORE the redirect and
 * travels in this row, not in a query parameter the callback would have to
 * trust.
 *
 * `invite` marks this state as invite-originated and fixes the CONFIRM window
 * now, at mint time, rather than leaving the callback to work it out from a row
 * that may have been swept by then. Both extra columns arrive in migration 118.
 *
 * They are omitted from the insert entirely when there is no invite, so the
 * admin-initiated flow keeps writing exactly the columns it wrote before this
 * feature existed — deploying this branch ahead of its migration degrades the
 * new flow only, instead of breaking the working one.
 */
export async function createOauthState(
  brandSlug: string,
  invite?: { id: string; expiresAt: string },
): Promise<string> {
  const supabase = await createAdminClient();
  const state = generateOauthState();

  const inviteColumns = invite
    ? {
        invite_id: invite.id,
        confirm_deadline_at: inviteConfirmDeadline(
          invite.expiresAt,
          new Date(),
          ADMIN_CONFIRM_WINDOW_MS,
          INVITE_CONFIRM_MAX_MS,
        ).toISOString(),
      }
    : {};

  // expires_at is left to its column default (now() + 10 minutes) so the
  // redemption window is set by the DB clock, not by ours.
  const { data, error } = await supabase
    .from('tiktok_oauth_states')
    .insert({ state, brand_slug: brandSlug, ...inviteColumns })
    .select('state');

  if (error) throw new Error(`[tiktok/oauth-state] could not create state: ${error.message}`);

  // Rowcount asserted, not assumed. A state that was never persisted sends the
  // operator to TikTok on a round trip that can only end in 'invalid_state',
  // with nothing anywhere explaining why.
  if (((data ?? []) as unknown[]).length !== 1) {
    throw new Error('[tiktok/oauth-state] state insert reported success but wrote no row.');
  }

  return state;
}

export type StateClaim =
  | { ok: true; brandSlug: string; state: string }
  | { ok: false; reason: 'invalid_state' };

/**
 * Redeem a state EXACTLY once.
 *
 * The guard is the `consumed_at IS NULL` predicate on the UPDATE, not a read
 * followed by a write: Postgres takes a row lock and re-evaluates the predicate
 * against the updated row, so two callbacks racing the same state produce one
 * winner and one zero-row result. A read-then-write would let both through.
 *
 * Zero rows back means replayed, expired, already consumed, or never issued —
 * all four are the same answer to the caller, on purpose. Distinguishing them
 * would tell an attacker which of their guesses was closest.
 *
 * (The expiry half of the predicate compares against the app clock rather than
 * SQL now(); the single-use half — the part that actually matters — is entirely
 * DB-side. A few seconds of clock skew against a 10-minute window is noise.)
 */
export async function claimOauthState(state: string): Promise<StateClaim> {
  const trimmed = (state ?? '').trim();
  if (!trimmed) return { ok: false, reason: 'invalid_state' };

  const supabase = await createAdminClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('tiktok_oauth_states')
    .update({ consumed_at: nowIso })
    .eq('state', trimmed)
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .select('state, brand_slug');

  if (error) throw new Error(`[tiktok/oauth-state] claim failed: ${error.message}`);

  const rows = (data ?? []) as Array<{ state: string; brand_slug: string }>;
  if (rows.length !== 1) return { ok: false, reason: 'invalid_state' };

  // The CANONICAL state comes back from the row we actually claimed, so every
  // later write targets the same key this claim matched. Re-deriving it from
  // the raw callback parameter is how a value that differs only by whitespace
  // claims one row and then updates none.
  return { ok: true, brandSlug: rows[0].brand_slug, state: rows[0].state };
}

/**
 * Park the exchanged token pair against the (already consumed) state until an
 * operator confirms which shop to bind.
 *
 * Encryption happens HERE rather than at the call site so there is no path
 * through this module that can write a plaintext token, and the envelope is
 * re-asserted afterwards so a future refactor that hands in an already-encrypted
 * string (double-encrypting) or a raw one (not encrypting) fails loudly.
 */
export async function storePendingAuthorization(args: {
  state: string;
  tokens: TikTokTokens;
  shopsPayload: unknown;
  /** The deadline decided at MINT time for an invite-originated authorization.
   *  Absent = the admin flow, and its 15 minutes. Never longer than the invite
   *  itself had left; see inviteConfirmDeadline. */
  confirmDeadlineAt?: string | null;
}): Promise<void> {
  const accessTokenEncrypted = encryptToken(args.tokens.accessToken);
  const refreshTokenEncrypted = encryptToken(args.tokens.refreshToken);

  if (!isEncryptedEnvelope(accessTokenEncrypted) || !isEncryptedEnvelope(refreshTokenEncrypted)) {
    throw new Error('[tiktok/oauth-state] refusing to store a token that is not an encryption envelope.');
  }

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('tiktok_oauth_states')
    .update({
      pending_access_token_encrypted: accessTokenEncrypted,
      pending_refresh_token_encrypted: refreshTokenEncrypted,
      pending_access_token_expires_at: args.tokens.accessTokenExpiresAt.toISOString(),
      pending_refresh_token_expires_at: args.tokens.refreshTokenExpiresAt.toISOString(),
      pending_open_id: args.tokens.openId,
      pending_seller_name: args.tokens.sellerName,
      pending_shops: args.shopsPayload ?? null,
      pending_expires_at:
        args.confirmDeadlineAt ??
        new Date(Date.now() + ADMIN_CONFIRM_WINDOW_MS).toISOString(),
    })
    // Caller passes the CANONICAL state returned by claimOauthState, never the
    // raw callback parameter.
    .eq('state', args.state)
    .select('state');

  if (error) throw new Error(`[tiktok/oauth-state] could not store pending authorization: ${error.message}`);

  // A PostgREST UPDATE that matches nothing returns error === null. Without this
  // assertion the callback would mint a live token pair, store none of it, and
  // still tell the operator the authorization is pending — a credential
  // discarded unrevoked while the UI reports success. "Silently reports success
  // when it wrote nothing" is the failure class that cost this business ten
  // days of data.
  if (((data ?? []) as unknown[]).length !== 1) {
    throw new Error('[tiktok/oauth-state] pending update matched no state row.');
  }
}

export interface StateConfirmContext {
  /** The client link this state came from, if any. */
  inviteId: string | null;
  /** The confirm deadline fixed at mint time, if any. */
  confirmDeadlineAt: string | null;
}

/**
 * Read the invite linkage a state was minted with.
 *
 * TOLERANT BY DESIGN. Both columns arrive in migration 118, and this is called
 * from the OAuth callback — the one request in the product that is holding a
 * single-use auth_code it can never get back. A deployment that runs ahead of
 * its migration must degrade to "admin flow, 15 minutes", which is exactly
 * today's behaviour, rather than losing a merchant's authorization to an
 * unknown-column error.
 */
export async function readStateConfirmContext(state: string): Promise<StateConfirmContext> {
  try {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('tiktok_oauth_states')
      .select('invite_id, confirm_deadline_at')
      .eq('state', state)
      .maybeSingle();

    if (error) {
      console.warn(`[tiktok/oauth-state] invite context unavailable: ${error.message}`);
      return { inviteId: null, confirmDeadlineAt: null };
    }

    const row = data as unknown as
      | { invite_id: string | null; confirm_deadline_at: string | null }
      | null;
    return {
      inviteId: row?.invite_id ?? null,
      confirmDeadlineAt: row?.confirm_deadline_at ?? null,
    };
  } catch (err) {
    console.warn(
      `[tiktok/oauth-state] invite context read failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { inviteId: null, confirmDeadlineAt: null };
  }
}

/** Authorizations waiting on a human, newest first. Non-secret fields only —
 *  this feeds the admin surface, and the ciphertext has no business there. */
export async function listPendingAuthorizations(): Promise<PendingAuthorization[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('tiktok_oauth_states')
    .select('state, brand_slug, pending_shops, pending_seller_name, pending_open_id, pending_expires_at')
    .not('pending_shops', 'is', null)
    .gt('pending_expires_at', new Date().toISOString())
    .order('pending_expires_at', { ascending: false });

  // Throw rather than return []: an empty list and a failed read look identical
  // in the UI, and "no pending authorizations" is a claim we would be making
  // without evidence.
  if (error) throw new Error(`[tiktok/oauth-state] pending list failed: ${error.message}`);

  return ((data ?? []) as PendingStateRow[]).map(toPendingAuthorization);
}

/** Read one pending authorization, ciphertext included, for the confirm step. */
export async function getPendingAuthorization(
  state: string,
): Promise<PendingAuthorizationWithTokens | null> {
  const trimmed = (state ?? '').trim();
  if (!trimmed) return null;

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('tiktok_oauth_states')
    .select(
      'state, brand_slug, pending_shops, pending_seller_name, pending_open_id, pending_expires_at, ' +
        'pending_access_token_encrypted, pending_refresh_token_encrypted, ' +
        'pending_access_token_expires_at, pending_refresh_token_expires_at',
    )
    .eq('state', trimmed)
    .gt('pending_expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) throw new Error(`[tiktok/oauth-state] pending read failed: ${error.message}`);
  const row = data as PendingStateRow | null;
  if (!row) return null;

  if (
    !row.pending_access_token_encrypted ||
    !row.pending_refresh_token_encrypted ||
    !row.pending_access_token_expires_at ||
    !row.pending_refresh_token_expires_at
  ) {
    return null;
  }

  return {
    ...toPendingAuthorization(row),
    accessTokenEncrypted: row.pending_access_token_encrypted,
    refreshTokenEncrypted: row.pending_refresh_token_encrypted,
    accessTokenExpiresAt: row.pending_access_token_expires_at,
    refreshTokenExpiresAt: row.pending_refresh_token_expires_at,
  };
}

/**
 * Erase the pending payload. Called the moment the confirm step stops needing
 * it — and also on cancel, because an abandoned authorization is a live
 * merchant credential sitting in a table nobody is watching.
 *
 * Returns whether a row was actually touched. Callers must not report "erased"
 * on a zero-row update: that is a claim about a credential, and getting it
 * wrong means telling an operator a token is gone while it is still there.
 */
export async function clearPendingAuthorization(state: string): Promise<boolean> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('tiktok_oauth_states')
    .update({
      pending_access_token_encrypted: null,
      pending_refresh_token_encrypted: null,
      pending_access_token_expires_at: null,
      pending_refresh_token_expires_at: null,
      pending_open_id: null,
      pending_seller_name: null,
      pending_shops: null,
      pending_expires_at: null,
    })
    .eq('state', state)
    .select('state');

  if (error) throw new Error(`[tiktok/oauth-state] could not clear pending authorization: ${error.message}`);

  return ((data ?? []) as unknown[]).length > 0;
}

export interface SweepResult {
  pendingCleared: number;
  rowsDeleted: number;
  /** Expired client connect links. Added in migration 118 — an invite holds no
   *  credential, so it is deleted outright rather than erased then reaped. */
  invitesDeleted: number;
}

/**
 * Erase lapsed pending credentials and delete husk rows.
 *
 * The real schedule is pg_cron (`tiktok-sweep-oauth-states`, every 5 minutes,
 * migration 117) — an operator who authorizes and never returns must not leave
 * a live refresh token parked, and no app-triggered sweep can promise that.
 * This wrapper exists so the erase ALSO happens on the Settings read and on
 * connect, and so it still happens at all in an environment without pg_cron.
 *
 * One RPC rather than two PostgREST statements: the TTL comparison then runs
 * against the DB clock, which is the clock the TTL was written in.
 *
 * Never throws into the caller's flow — failing to tidy up must not block a
 * connect or blank the Settings panel.
 */
export async function sweepOauthStates(): Promise<SweepResult | null> {
  try {
    const supabase = await createAdminClient();
    const { data, error } = await supabase.rpc('tiktok_sweep_oauth_states');
    if (error) {
      console.warn(`[tiktok/oauth-state] sweep failed: ${error.message}`);
      return null;
    }
    const row = (Array.isArray(data) ? data[0] : data) as
      | { pending_cleared: number; rows_deleted: number; invites_deleted?: number }
      | undefined;
    if (!row) return null;

    if (row.pending_cleared > 0) {
      // Worth a line: each one is a merchant credential that reached its TTL
      // without anybody confirming it.
      console.warn(`[tiktok/oauth-state] erased ${row.pending_cleared} lapsed pending authorization(s)`);
    }
    return {
      pendingCleared: row.pending_cleared,
      rowsDeleted: row.rows_deleted,
      // Optional-chained rather than assumed: the column arrives with migration
      // 118, and a deploy that runs ahead of the migration must not read NaN
      // into a count.
      invitesDeleted: row.invites_deleted ?? 0,
    };
  } catch (err) {
    console.warn(`[tiktok/oauth-state] sweep failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

interface PendingStateRow {
  state: string;
  brand_slug: string;
  pending_shops: unknown;
  pending_seller_name: string | null;
  pending_open_id: string | null;
  pending_expires_at: string;
  pending_access_token_encrypted?: string | null;
  pending_refresh_token_encrypted?: string | null;
  pending_access_token_expires_at?: string | null;
  pending_refresh_token_expires_at?: string | null;
}

function toPendingAuthorization(row: PendingStateRow): PendingAuthorization {
  return {
    state: row.state,
    brandSlug: row.brand_slug,
    shops: parseAuthorizedShops(row.pending_shops),
    sellerName: row.pending_seller_name,
    openId: row.pending_open_id,
    pendingExpiresAt: row.pending_expires_at,
  };
}
