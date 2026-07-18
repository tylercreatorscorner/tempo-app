import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';

const COOKIE_NAME = 'creator_session';
const MAGIC_LINK_TTL_SECONDS = 15 * 60;
// Claim links are DM'd to creators who may not open them for a while, so they
// live much longer than a magic link. They're single-creator-scoped and
// single-use (the JTI is marked consumed in creator_claim_tokens on first claim).
const CLAIM_LINK_TTL_SECONDS = 60 * 60 * 24 * 60; // 60 days

function loadJwtSecret(): Uint8Array {
  const fromEnv = process.env.CREATOR_JWT_SECRET;
  if (fromEnv && fromEnv.length >= 32) {
    return new TextEncoder().encode(fromEnv);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'CREATOR_JWT_SECRET must be set to a 32+ character secret in production. ' +
      'Without it, anyone reading the source can mint valid creator session tokens.'
    );
  }
  // Dev fallback: stable per-process secret so hot-reloads don't invalidate cookies.
  return new TextEncoder().encode('tempo-dev-secret-not-for-production-use-only');
}

const JWT_SECRET = loadJwtSecret();

export interface CreatorTokenPayload {
  creatorId: number;
  email: string;
  jti?: string; // unique token id, used for magic-link/claim replay protection
  purpose?: 'claim'; // present on claim-link tokens; absent on session tokens
}

/**
 * Generate a magic-link token (valid 15 minutes) with a fresh JTI for
 * single-use replay protection. The verify route inserts the JTI into
 * `creator_magic_link_tokens` on consume; a second consume hits the PK
 * uniqueness constraint and is rejected.
 */
export async function generateMagicToken(
  payload: CreatorTokenPayload
): Promise<{ token: string; jti: string; expiresAt: Date }> {
  const jti = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_SECONDS * 1000);
  const token = await new SignJWT({ ...payload, jti })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setJti(jti)
    .setExpirationTime(`${MAGIC_LINK_TTL_SECONDS}s`)
    .sign(JWT_SECRET);
  return { token, jti, expiresAt };
}

/**
 * Generate a long-lived (60-day) claim-link token for a specific creator, to be
 * DM'd by the bot. Carries `purpose: 'claim'` and a fresh JTI; the /creator-claim
 * route inserts the JTI into `creator_claim_tokens` on mint and marks it consumed
 * on first successful claim (single-use). A leaked link only ever exposes that one
 * creator's own portal, never another creator's or any agency internals.
 */
export async function generateClaimToken(
  payload: CreatorTokenPayload
): Promise<{ token: string; jti: string; expiresAt: Date }> {
  const jti = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + CLAIM_LINK_TTL_SECONDS * 1000);
  const token = await new SignJWT({ ...payload, purpose: 'claim', jti })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setJti(jti)
    .setExpirationTime(`${CLAIM_LINK_TTL_SECONDS}s`)
    .sign(JWT_SECRET);
  return { token, jti, expiresAt };
}

/** Generate a session token (valid 30 days) */
export async function generateSessionToken(payload: CreatorTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(JWT_SECRET);
}

/** Verify any token */
export async function verifyToken(token: string): Promise<CreatorTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as CreatorTokenPayload;
  } catch {
    return null;
  }
}

/** Set the session cookie */
export async function setCreatorSession(payload: CreatorTokenPayload): Promise<void> {
  const token = await generateSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });
}

/** Get creator session from cookie */
export async function getCreatorSession(): Promise<CreatorTokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** Clear session cookie */
export async function clearCreatorSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/** Get the brand cookie or return null */
export async function getCurrentBrandCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get('creator_brand')?.value ?? null;
}

/** Set the brand cookie */
export async function setCurrentBrandCookie(brand: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set('creator_brand', brand, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  });
}
