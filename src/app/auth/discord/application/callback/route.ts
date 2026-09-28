import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { discordIdentityCookie, signDiscordIdentity, type DiscordIdentity } from '@/lib/applications/discord-identity';

export const runtime = 'nodejs';

const STATE_COOKIE = 'tempo_discord_application_state';

function matchesState(expected: string, received: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

function returnTo(request: NextRequest, formId: string, outcome: string, hubId?: string): NextResponse {
  const url = new URL(hubId ? `/hub/${hubId}` : `/apply/${formId}`, request.url);
  url.searchParams.set('discord', outcome);
  const response = NextResponse.redirect(url);
  response.cookies.set(STATE_COOKIE, '', { path: '/auth/discord/application/callback', maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  const stateCookie = request.cookies.get(STATE_COOKIE)?.value || '';
  const divider = stateCookie.indexOf('.');
  const expectedState = divider > 0 ? stateCookie.slice(0, divider) : '';
  const target = divider > 0 ? stateCookie.slice(divider + 1).split('.') : [];
  const formId = target[0] || '';
  const hubId = target[1];
  if (!z.uuid().safeParse(formId).success || !expectedState ||
      (hubId && !z.uuid().safeParse(hubId).success) ||
      !matchesState(expectedState, request.nextUrl.searchParams.get('state') || '')) {
    const response = new NextResponse('Discord sign-in could not be verified. Return to the application and try again.', { status: 400 });
    response.cookies.set(STATE_COOKIE, '', { path: '/auth/discord/application/callback', maxAge: 0 });
    return response;
  }
  const code = request.nextUrl.searchParams.get('code');
  if (request.nextUrl.searchParams.has('error') || !code) return returnTo(request, formId, 'denied', hubId);
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_APPLICATION_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri || !process.env.APPLICATION_DISCORD_COOKIE_SECRET) {
    return returnTo(request, formId, 'unavailable', hubId);
  }
  try {
    const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret,
        grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
      signal: AbortSignal.timeout(10000),
    });
    if (!tokenResponse.ok) return returnTo(request, formId, 'failed', hubId);
    const token: unknown = await tokenResponse.json();
    if (!token || typeof token !== 'object' || typeof (token as { access_token?: unknown }).access_token !== 'string') {
      return returnTo(request, formId, 'failed', hubId);
    }
    const accessToken = (token as { access_token: string }).access_token;
    const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
      cache: 'no-store', headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000),
    });
    if (!userResponse.ok) return returnTo(request, formId, 'failed', hubId);
    const user: unknown = await userResponse.json();
    if (!user || typeof user !== 'object') return returnTo(request, formId, 'failed', hubId);
    const profile = user as { id?: unknown; username?: unknown; global_name?: unknown; avatar?: unknown };
    if (typeof profile.id !== 'string' || !/^\d{17,20}$/.test(profile.id) ||
        typeof profile.username !== 'string' || !profile.username || profile.username.length > 80) {
      return returnTo(request, formId, 'failed', hubId);
    }
    const identity: DiscordIdentity = {
      formId, id: profile.id, username: profile.username,
      globalName: typeof profile.global_name === 'string' ? profile.global_name.slice(0, 100) : null,
      avatar: typeof profile.avatar === 'string' ? profile.avatar.slice(0, 100) : null,
    };
    const response = returnTo(request, formId, 'connected', hubId);
    response.cookies.set(discordIdentityCookie.name, signDiscordIdentity(identity), {
      ...discordIdentityCookie.options, maxAge: discordIdentityCookie.maxAge,
    });
    return response;
  } catch {
    return returnTo(request, formId, 'failed', hubId);
  }
}
