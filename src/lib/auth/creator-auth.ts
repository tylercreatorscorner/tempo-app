import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'creator_session';
const JWT_SECRET = new TextEncoder().encode(
  process.env.CREATOR_JWT_SECRET || 'tempo-dev-secret'
);

export interface CreatorTokenPayload {
  creatorId: number;
  email: string;
  tenantId: string;
}

/** Generate a magic link token (valid 15 minutes) */
export async function generateMagicToken(payload: CreatorTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(JWT_SECRET);
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
