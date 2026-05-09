/**
 * GET /api/integrations/slack/oauth/start?brand_id=X
 *
 * Kicks off the Slack OAuth install flow:
 *   1) Generate a signed `state` token containing brand_id + nonce + tenant_id
 *   2) Redirect the browser to Slack's authorize endpoint with our scopes
 *
 * Slack will bounce back to /api/integrations/slack/oauth/callback after
 * the user clicks Allow. The state is verified there to bind brand + tenant.
 *
 * Required env:
 *   SLACK_CLIENT_ID       — public client id from your Slack app
 *   SLACK_CLIENT_SECRET   — private secret (used in callback only)
 *   AUTH_SECRET / NEXTAUTH_SECRET — used to sign the state HMAC
 *   NEXT_PUBLIC_SITE_URL  — your canonical site origin (https://app.tempoapp.ai)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import crypto from 'node:crypto';

export const runtime = 'nodejs';

// Bot scopes — what the Slack workspace will be asked to grant. Keep this
// minimal; you can always add more later by re-installing.
const SCOPES = [
  'chat:write',          // post messages
  'channels:read',       // list public channels for the picker
  'groups:read',         // list private channels the bot is in
  'channels:join',       // optional: bot can self-join public channels (handy)
].join(',');

function getStateSecret(): string {
  return process.env.AUTH_SECRET
      ?? process.env.NEXTAUTH_SECRET
      ?? process.env.SUPABASE_SERVICE_ROLE_KEY  // fallback so dev works
      ?? '';
}

export function signState(payload: object): string {
  const secret = getStateSecret();
  const json = JSON.stringify(payload);
  const data = Buffer.from(json).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export async function GET(req: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'SLACK_CLIENT_ID is not configured. Add it to Vercel env vars.' }, { status: 500 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const redirectUri = `${siteUrl}/api/integrations/slack/oauth/callback`;

  const brandId = req.nextUrl.searchParams.get('brand_id');

  const state = signState({
    nonce: crypto.randomBytes(16).toString('hex'),
    brand_id: brandId === 'workspace' || brandId === 'all' ? null : brandId,
    tenant_id: profile.tenant_id,
    user_id: profile.user_id,
    issued_at: Date.now(),
  });

  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);

  return NextResponse.redirect(url.toString());
}
