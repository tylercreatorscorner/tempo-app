/**
 * Pure half of the client connect-link module — no DB, no node:crypto, no
 * next/headers, so it is unit-testable and safe to import from anywhere.
 * The storage half is ./connect-invites (same split as brand-registry /
 * brand-registry-core).
 */

/** 32 bytes → 43 base64url characters, no padding. */
const TOKEN_LENGTH = 43;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * How many times one link may be redeemed. MIRRORS the literal 5 inside
 * tiktok_redeem_connect_invite() (migration 118) — the DB is the enforcement,
 * this is only the label. Change both together.
 *
 * Not 1: the client signed in as a sub-account presses Continue, gets refused
 * by TikTok, signs back in as the owner and re-opens the emailed link. A
 * strictly single-use link is dead exactly when the flow needs it most.
 */
export const INVITE_MAX_REDEMPTIONS = 5;

/**
 * Shape check before any DB work.
 *
 * This leaks nothing about which tokens exist: a string of the wrong shape
 * could never have been issued, so "not a valid link" is true for every caller
 * regardless of the table's contents. It exists to keep junk path segments
 * (crawlers, links truncated by an email client) from reaching the database.
 */
export function looksLikeInviteToken(token: string): boolean {
  return token.length === TOKEN_LENGTH && TOKEN_PATTERN.test(token);
}

export interface ConnectInvite {
  id: string;
  token: string;
  brandSlug: string;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string;
  redeemCount: number;
  lastRedeemedAt: string | null;
  consumedAt: string | null;
  revokedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
}

export type InviteState =
  /** Killed by an operator. */
  | 'revoked'
  /** A COMPLETED authorization came back. The only evidence-backed one. */
  | 'authorized'
  /** Past its 72 hours. */
  | 'expired'
  /** Retry budget spent without an authorization ever arriving. */
  | 'exhausted'
  /** The client pressed Continue and was handed to TikTok. Nothing has come
   *  back — which is NOT the same as having authorized. */
  | 'redeemed'
  /** The link was opened (possibly by an email scanner). */
  | 'opened'
  /** Issued, no sign of life. */
  | 'sent';

/**
 * What an operator is looking at when they scan the list.
 *
 * The ORDER is load-bearing and mirrors the CASE in
 * tiktok_open_connect_invite() (migration 118): a link that was authorized and
 * has since passed its expiry reads 'authorized', never 'expired'. Getting that
 * backwards tells an operator to chase a client who already did the thing.
 *
 * 'redeemed' vs 'authorized' is the distinction that matters most. A redemption
 * means one thing only: the browser was handed to TikTok. It reads identically
 * after a sub-account refusal, a cancelled consent screen, or a closed tab. Only
 * consumedAt — stamped by the callback once a pending authorization is actually
 * parked — is proof, and it is the only input allowed to produce 'authorized'.
 *
 * `now` is passed in rather than read here so a whole list is classified
 * against ONE instant; two rows a millisecond apart cannot otherwise land on
 * different sides of an expiry.
 */
export function describeInviteState(
  invite: Pick<
    ConnectInvite,
    'consumedAt' | 'revokedAt' | 'expiresAt' | 'redeemCount' | 'openCount'
  >,
  now: Date,
): InviteState {
  if (invite.revokedAt) return 'revoked';
  if (invite.consumedAt) return 'authorized';
  if (Date.parse(invite.expiresAt) <= now.getTime()) return 'expired';
  if (invite.redeemCount >= INVITE_MAX_REDEMPTIONS) return 'exhausted';
  if (invite.redeemCount > 0) return 'redeemed';
  return invite.openCount > 0 ? 'opened' : 'sent';
}

/**
 * How long the operator gets to bind a shop, for an authorization that came
 * from a client link.
 *
 * The admin flow's 15 minutes is right when one person authorizes and confirms
 * in a single sitting, and fatally wrong here: the client clicks at 8am, the
 * sweep erases the tokens at 8:15, and the authorization is gone before anyone
 * has read a notice about it.
 *
 * Bounded on BOTH sides, and both bounds are load-bearing:
 *   ceiling — never longer than the invite's own remaining life, capped at the
 *             72h maximum, so a parked credential cannot outlive the promise
 *             the link was issued under.
 *   floor   — never SHORTER than the admin window. Without it, a client who
 *             clicks two minutes before the link expires hands the operator a
 *             two-minute window: worse than the behaviour this exists to fix.
 */
export function inviteConfirmDeadline(
  inviteExpiresAt: string,
  now: Date,
  adminWindowMs: number,
  maxWindowMs: number,
): Date {
  const remainingMs = Date.parse(inviteExpiresAt) - now.getTime();
  const usable = Number.isFinite(remainingMs) ? remainingMs : 0;
  const windowMs = Math.min(Math.max(usable, adminWindowMs), maxWindowMs);
  return new Date(now.getTime() + windowMs);
}

/** The URL a client receives. Built from an explicit base so a link created on
 *  a preview deployment is not pasted into an email pointing at a host the
 *  client cannot resolve tomorrow. */
export function buildInviteUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/connect/tiktok/${token}`;
}
