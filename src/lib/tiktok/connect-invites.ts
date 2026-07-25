/**
 * Shareable client connect links.
 *
 * TikTok will not accept an authorization from a sub-account — "Sub-accounts
 * are unable to authorize. To authorize, log out and retry with your main
 * seller account" — so the human who has to click Connect is the CLIENT, not
 * the agency admin, and the two halves of the flow happen on different days in
 * different browsers. The OAuth state nonce lives ten minutes and must keep
 * living ten minutes (it is the only thing authenticating TikTok's callback),
 * so the long-lived artifact is this one instead: a claim ticket of ours that
 * carries no OAuth meaning, is revocable, and mints a normal short-lived state
 * only at the moment the client clicks through.
 *
 * Redeeming an invite gets the client to TikTok's consent screen and no
 * further. The pending authorization it produces still has to be bound to a
 * shop by an authenticated admin (api/tiktok/connections/confirm) — a client
 * can grant access, only an operator decides which storefront becomes which
 * brand's numbers.
 *
 * Service-role only (migration 118: RLS on, no policies, anon/authenticated
 * revoked).
 */
import { randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import type { ConnectInvite } from './connect-invites-core';

export * from './connect-invites-core';

/** 32 bytes of CSPRNG entropy, base64url so it is safe as a URL path segment.
 *  Same generator as the OAuth state nonce; never a uuid, a timestamp, or
 *  Math.random. */
export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

interface InviteRow {
  id: string;
  token: string;
  brand_slug: string;
  created_by: string | null;
  created_at: string;
  expires_at: string;
  redeem_count: number;
  last_redeemed_at: string | null;
  consumed_at: string | null;
  revoked_at: string | null;
  last_opened_at: string | null;
  open_count: number;
}

function toInvite(row: InviteRow): ConnectInvite {
  return {
    id: row.id,
    token: row.token,
    brandSlug: row.brand_slug,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    redeemCount: row.redeem_count,
    lastRedeemedAt: row.last_redeemed_at,
    consumedAt: row.consumed_at,
    // Carried even though listConnectInvites filters revoked rows out: the
    // state classifier decides from the row, not from which query produced it.
    revokedAt: row.revoked_at,
    lastOpenedAt: row.last_opened_at,
    openCount: row.open_count,
  };
}

const INVITE_COLUMNS =
  'id, token, brand_slug, created_by, created_at, expires_at, redeem_count, last_redeemed_at, ' +
  'consumed_at, revoked_at, last_opened_at, open_count';

/** Issue a link for one brand. expires_at is left to the column default
 *  (now() + 72 hours) so the deadline is set by the DB clock — the same clock
 *  every later expiry check reads. */
export async function createConnectInvite(args: {
  brandSlug: string;
  createdBy: string | null;
}): Promise<ConnectInvite> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('tiktok_connect_invites')
    .insert({
      token: generateInviteToken(),
      brand_slug: args.brandSlug,
      created_by: args.createdBy,
    })
    .select(INVITE_COLUMNS);

  if (error) throw new Error(`[tiktok/connect-invites] could not create invite: ${error.message}`);

  // Rowcount asserted, not assumed. A PostgREST insert that wrote nothing
  // returns error === null, and the operator would copy a URL that resolves to
  // a dead link — then blame the client for not clicking it.
  // Double cast, as in connections.ts: the generated Database types do not
  // know this table until they are regenerated post-migration, so PostgREST's
  // select-string inference degrades to GenericStringError.
  const rows = (data ?? []) as unknown as InviteRow[];
  if (rows.length !== 1) {
    throw new Error('[tiktok/connect-invites] invite insert reported success but wrote no row.');
  }

  return toInvite(rows[0]);
}

/**
 * Links still worth showing: not revoked, not past expiry. An AUTHORIZED link
 * stays in the list until it expires — "the client did it" is the answer the
 * operator came for, and hiding it looks identical to never having sent one.
 *
 * Explicitly bounded at 100 rather than relying on PostgREST's implicit
 * 1000-row cap. At ~16 brands with a handful of links each this cannot truncate
 * anything real, and an explicit limit is a decision rather than a silent
 * ceiling.
 */
export async function listConnectInvites(): Promise<ConnectInvite[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('tiktok_connect_invites')
    .select(INVITE_COLUMNS)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(100);

  // Throw rather than return []: an empty list and a failed read render
  // identically, and "no outstanding links" is a claim we would be making
  // without evidence — the operator would issue a duplicate.
  if (error) throw new Error(`[tiktok/connect-invites] list failed: ${error.message}`);

  return ((data ?? []) as unknown as InviteRow[]).map(toInvite);
}

/** Kill a link. Returns whether a row was actually touched — reporting
 *  "revoked" on a zero-row update is a claim about who can still authorize a
 *  shop, and it would be false. */
export async function revokeConnectInvite(id: string): Promise<boolean> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('tiktok_connect_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('revoked_at', null)
    // A link that already produced an authorization cannot be redeemed again
    // (the redemption predicate refuses it), so "revoked" here would claim a
    // protection that did nothing.
    .is('consumed_at', null)
    .select('id');

  if (error) throw new Error(`[tiktok/connect-invites] revoke failed: ${error.message}`);

  return ((data ?? []) as unknown[]).length > 0;
}

export type InviteOpenStatus =
  | 'revoked'
  | 'consumed'
  | 'expired'
  | 'exhausted'
  | 'missing';

export type InviteOpen =
  | { status: 'live'; brandSlug: string }
  | { status: InviteOpenStatus };

/**
 * Classify a token and stamp the open, in ONE statement (migration 118's
 * tiktok_open_connect_invite). One round trip, so the public page cannot be
 * turned into a read-then-write race, and the open counter is capped in SQL
 * rather than by a read the caller could skip.
 *
 * The non-live statuses are for the server log only. Every one of them renders
 * the same page.
 */
export async function openConnectInvite(token: string): Promise<InviteOpen> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.rpc('tiktok_open_connect_invite', { p_token: token });

  if (error) throw new Error(`[tiktok/connect-invites] open failed: ${error.message}`);

  const row = (Array.isArray(data) ? data[0] : data) as
    | { invite_brand_slug: string | null; invite_status: string }
    | undefined;
  if (!row) return { status: 'missing' };

  if (row.invite_status === 'live' && row.invite_brand_slug) {
    return { status: 'live', brandSlug: row.invite_brand_slug };
  }
  // A 'live' row with no brand_slug is impossible (NOT NULL) — but if it ever
  // happened, falling through to 'missing' refuses rather than sends a client
  // to TikTok with no brand attached.
  const known: InviteOpenStatus[] = ['revoked', 'consumed', 'expired', 'exhausted'];
  const status = known.find((s) => s === row.invite_status);
  return { status: status ?? 'missing' };
}

export interface RedeemedInvite {
  id: string;
  brandSlug: string;
  /** The link's own expiry — the ceiling on how long the operator gets to
   *  confirm the authorization this redemption is about to produce. */
  expiresAt: string;
}

/**
 * Spend one redemption, atomically and within budget.
 *
 * The increment and the cap live in ONE SQL statement
 * (tiktok_redeem_connect_invite, migration 118): Postgres takes a row lock and
 * re-evaluates `redeem_count < 5` against the updated row, so concurrent clicks
 * cannot both pass. A read-then-write would let them.
 *
 * That cap is what bounds tiktok_oauth_states: this is an unauthenticated
 * write path, and without a ceiling anyone holding a live token could mint
 * state rows in a loop. Five is the ceiling; it is not one, because the single
 * most likely path through this feature is a client who is refused by TikTok
 * for being on a sub-account and comes back to the same emailed link.
 *
 * Zero rows means revoked, expired, exhausted, already authorized, or never
 * issued — all one answer to the caller, on purpose.
 */
export async function redeemConnectInvite(token: string): Promise<RedeemedInvite | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.rpc('tiktok_redeem_connect_invite', { p_token: token });

  if (error) throw new Error(`[tiktok/connect-invites] redeem failed: ${error.message}`);

  const row = (Array.isArray(data) ? data[0] : data) as
    | { invite_id: string; invite_brand_slug: string; invite_expires_at: string }
    | undefined;
  if (!row) return null;

  return { id: row.invite_id, brandSlug: row.invite_brand_slug, expiresAt: row.invite_expires_at };
}

/**
 * Record that a COMPLETED authorization came back for this link.
 *
 * Called by the OAuth callback once a pending authorization has actually been
 * parked — never at the click. That distinction is the whole point: "pressed
 * Continue" and "granted access" are different facts, and the panel is only
 * allowed to say the second one when this column is set.
 *
 * Returns whether a row was stamped. `false` is not an error — a second
 * completed authorization from the same link (the client redeemed twice and
 * finished both) legitimately finds consumed_at already set.
 */
export async function markInviteAuthorized(inviteId: string): Promise<boolean> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('tiktok_connect_invites')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', inviteId)
    .is('consumed_at', null)
    .select('id');

  if (error) throw new Error(`[tiktok/connect-invites] authorize stamp failed: ${error.message}`);

  return ((data ?? []) as unknown[]).length > 0;
}

/** Everything the operator notice needs, read by id. Deliberately NOT the
 *  token: a notification must never carry the URL secret into an inbox or a
 *  chat channel that was not the intended recipient. */
export async function getInviteNotice(
  inviteId: string,
): Promise<{ brandSlug: string; createdBy: string | null } | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('tiktok_connect_invites')
    .select('brand_slug, created_by')
    .eq('id', inviteId)
    .maybeSingle();

  if (error) throw new Error(`[tiktok/connect-invites] notice read failed: ${error.message}`);
  const row = data as unknown as { brand_slug: string; created_by: string | null } | null;
  if (!row) return null;

  return { brandSlug: row.brand_slug, createdBy: row.created_by };
}
