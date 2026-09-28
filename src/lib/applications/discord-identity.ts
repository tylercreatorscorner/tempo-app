import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'tempo_discord_identity';
const SESSION_SECONDS = 7 * 24 * 60 * 60;

export type DiscordIdentity = {
  formId: string;
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
};

function signingKey(): string | null {
  const key = process.env.APPLICATION_DISCORD_COOKIE_SECRET;
  return key && key.length >= 32 ? key : null;
}

function signature(value: string, key: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

export function signDiscordIdentity(identity: DiscordIdentity): string {
  const key = signingKey();
  if (!key) throw new Error('APPLICATION_DISCORD_COOKIE_SECRET must contain at least 32 characters');
  const payload = Buffer.from(JSON.stringify({ ...identity, expiresAt: Date.now() + SESSION_SECONDS * 1000 })).toString('base64url');
  return `${payload}.${signature(payload, key).toString('base64url')}`;
}

export function verifyDiscordIdentity(value: string | undefined): DiscordIdentity | null {
  const key = signingKey();
  if (!key || !value) return null;
  const parts = value.split('.');
  if (parts.length !== 2) return null;
  const [payload, supplied] = parts;
  try {
    const expected = signature(payload, key);
    const actual = Buffer.from(supplied, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const data: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data || typeof data !== 'object') return null;
    const identity = data as Partial<DiscordIdentity> & { expiresAt?: unknown };
    if (typeof identity.expiresAt !== 'number' || identity.expiresAt < Date.now() ||
      typeof identity.formId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identity.formId) ||
      typeof identity.id !== 'string' || !/^\d{17,20}$/.test(identity.id) ||
      typeof identity.username !== 'string' || !identity.username || identity.username.length > 80 ||
      (identity.globalName !== null && typeof identity.globalName !== 'string') ||
      (identity.avatar !== null && typeof identity.avatar !== 'string')) return null;
    return { formId: identity.formId, id: identity.id, username: identity.username, globalName: identity.globalName, avatar: identity.avatar };
  } catch {
    return null;
  }
}

export async function getDiscordIdentity(): Promise<DiscordIdentity | null> {
  return verifyDiscordIdentity((await cookies()).get(COOKIE_NAME)?.value);
}

export function verifyApplicationDiscordIdentity(value: string | undefined, formId: string): DiscordIdentity | null {
  const identity = verifyDiscordIdentity(value);
  return identity?.formId === formId ? identity : null;
}

export async function getApplicationDiscordIdentity(formId: string): Promise<DiscordIdentity | null> {
  return verifyApplicationDiscordIdentity((await cookies()).get(COOKIE_NAME)?.value, formId);
}

export const discordIdentityCookie = {
  name: COOKIE_NAME,
  maxAge: SESSION_SECONDS,
  options: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' },
};
