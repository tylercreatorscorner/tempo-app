import { headers } from 'next/headers';

/** UI availability only; the OAuth start route repeats this check before redirecting. */
export async function isDiscordApplicationSignInAvailable(): Promise<boolean> {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const cookieSecret = process.env.APPLICATION_DISCORD_COOKIE_SECRET;
  const redirectUri = process.env.DISCORD_APPLICATION_REDIRECT_URI;
  if (!clientId || !clientSecret || !cookieSecret || cookieSecret.length < 32 || !redirectUri) return false;
  const requestHeaders = await headers();
  const host = requestHeaders.get('host');
  if (!host) return false;
  const protocol = requestHeaders.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  try {
    const callback = new URL(redirectUri);
    return callback.origin === `${protocol}://${host}` &&
      callback.pathname === '/auth/discord/application/callback';
  } catch {
    return false;
  }
}
