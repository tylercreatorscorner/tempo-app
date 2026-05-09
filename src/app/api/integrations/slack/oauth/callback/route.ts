/**
 * GET /api/integrations/slack/oauth/callback
 *
 * Slack redirects here after the user authorizes the Tempo app. We:
 *   1) Verify the signed `state` (CSRF protection + carries brand_id)
 *   2) Exchange `code` for an access token via oauth.v2.access
 *   3) Insert / upsert a row into `integrations` with type='slack'
 *   4) Redirect back to /workflows/integrations with a success flash
 *
 * Required env:
 *   SLACK_CLIENT_ID, SLACK_CLIENT_SECRET
 *   NEXT_PUBLIC_SITE_URL
 *   AUTH_SECRET (for state verification — must match the start route)
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { exchangeSlackOAuthCode } from '@/lib/integrations/actions/slack';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface StatePayload {
  nonce: string;
  brand_id: string | null;
  tenant_id: string;
  user_id: string;
  issued_at: number;
}

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes — install flow shouldn't take longer than this

function getStateSecret(): string {
  return process.env.AUTH_SECRET
      ?? process.env.NEXTAUTH_SECRET
      ?? process.env.SUPABASE_SERVICE_ROLE_KEY
      ?? '';
}

function verifyState(state: string): StatePayload | null {
  const secret = getStateSecret();
  if (!secret) return null;
  const [data, sig] = state.split('.');
  if (!data || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8')) as StatePayload;
    if (Date.now() - payload.issued_at > STATE_TTL_MS) return null;
    return payload;
  } catch { return null; }
}

function redirectTo(siteUrl: string, params: Record<string, string>): NextResponse {
  const u = new URL('/workflows/integrations', siteUrl);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return NextResponse.redirect(u.toString());
}

export async function GET(req: NextRequest) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const slackError = req.nextUrl.searchParams.get('error');

  if (slackError) {
    return redirectTo(siteUrl, { connect_error: slackError });
  }
  if (!code || !state) {
    return redirectTo(siteUrl, { connect_error: 'missing_code_or_state' });
  }

  const verified = verifyState(state);
  if (!verified) {
    return redirectTo(siteUrl, { connect_error: 'invalid_or_expired_state' });
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redirectTo(siteUrl, { connect_error: 'slack_oauth_not_configured' });
  }

  const exchange = await exchangeSlackOAuthCode({
    code,
    clientId,
    clientSecret,
    redirectUri: `${siteUrl}/api/integrations/slack/oauth/callback`,
  });
  if (!exchange.ok) {
    return redirectTo(siteUrl, { connect_error: exchange.error ?? 'oauth_exchange_failed' });
  }

  const supabase = await createAdminClient();
  // Upsert by (tenant_id, type, team_id-in-config) so a re-install of the same
  // workspace updates rather than duplicates. Using the unique config fields
  // would normally need a migration with a partial unique index — for v1 we
  // do a manual look-then-insert.
  const teamId = exchange.teamId ?? null;
  const { data: existing } = await supabase
    .from('integrations')
    .select('id')
    .eq('tenant_id', verified.tenant_id)
    .eq('type', 'slack')
    .filter('config->>team_id', 'eq', teamId ?? '')
    .maybeSingle();

  const row = {
    tenant_id: verified.tenant_id,
    brand_id: verified.brand_id,
    type: 'slack' as const,
    display_name: exchange.teamName ?? 'Slack workspace',
    config: {
      team_id: teamId,
      team_name: exchange.teamName,
      bot_user_id: exchange.botUserId,
      scope: exchange.scope,
    },
    credentials: { access_token: exchange.accessToken },
    status: 'connected' as const,
    connected_at: new Date().toISOString(),
    last_used_at: null,
    last_error_at: null,
    last_error_message: null,
  };

  if (existing) {
    const { error } = await supabase.from('integrations').update(row).eq('id', existing.id);
    if (error) return redirectTo(siteUrl, { connect_error: error.message });
  } else {
    const { error } = await supabase.from('integrations').insert(row);
    if (error) return redirectTo(siteUrl, { connect_error: error.message });
  }

  return redirectTo(siteUrl, {
    connected: 'slack',
    workspace: exchange.teamName ?? 'Slack',
  });
}
