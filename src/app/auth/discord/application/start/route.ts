import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';

const STATE_COOKIE = 'tempo_discord_application_state';

export async function GET(request: NextRequest) {
  const formId = request.nextUrl.searchParams.get('form');
  if (!z.uuid().safeParse(formId).success) return new NextResponse('Invalid application link.', { status: 400 });
  const hubId = request.nextUrl.searchParams.get('hub');
  if (hubId && !z.uuid().safeParse(hubId).success) return new NextResponse('Invalid Hub link.', { status: 400 });
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_APPLICATION_REDIRECT_URI;
  if (!clientId || !redirectUri || !process.env.DISCORD_CLIENT_SECRET ||
      !process.env.APPLICATION_DISCORD_COOKIE_SECRET || process.env.APPLICATION_DISCORD_COOKIE_SECRET.length < 32) {
    return new NextResponse('Discord sign-in is temporarily unavailable.', { status: 503 });
  }
  // The callback must set a cookie for the same host that started authorization.
  let callback: URL;
  try { callback = new URL(redirectUri); } catch { return new NextResponse('Discord sign-in is temporarily unavailable.', { status: 503 }); }
  if (callback.origin !== request.nextUrl.origin || callback.pathname !== '/auth/discord/application/callback') {
    return new NextResponse('Discord sign-in is unavailable on this URL.', { status: 503 });
  }
  const state = randomBytes(32).toString('base64url');
  const authorize = new URL('https://discord.com/oauth2/authorize');
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('scope', 'identify');
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('state', state);
  const response = NextResponse.redirect(authorize);
  response.cookies.set(STATE_COOKIE, `${state}.${formId}${hubId ? `.${hubId}` : ''}`, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    path: '/auth/discord/application/callback', maxAge: 600,
  });
  return response;
}
