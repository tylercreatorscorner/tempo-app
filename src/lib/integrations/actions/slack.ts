/**
 * Slack action library — direct HTTPS API calls using the per-install bot
 * token. Token comes from `integration.credentials.access_token` (set during
 * the OAuth callback at /api/integrations/slack/oauth/callback).
 *
 * No persistent client / no Slack Events API for now — purely outbound calls.
 * Inbound interactions (slash commands, message events) are out of scope
 * for Phase 3.
 */

const API_BASE = 'https://slack.com/api';

export interface SlackSendResult {
  ok: boolean;
  /** Slack ts (timestamp string) — Slack's idea of a message id */
  ts?: string;
  channel?: string;
  status?: number;
  error?: string;
}

interface SendArgs {
  channelId: string;
  text: string;
  token: string;
}

export async function sendSlackMessage({ channelId, text, token }: SendArgs): Promise<SlackSendResult> {
  if (!token) return { ok: false, error: 'Slack access_token missing — re-connect the integration' };
  if (!text.trim()) return { ok: false, error: 'message cannot be empty' };

  try {
    const res = await fetch(`${API_BASE}/chat.postMessage`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel: channelId, text }),
    });

    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      ts?: string;
      channel?: string;
      error?: string;
    };

    if (!j.ok) {
      return { ok: false, status: res.status, error: j.error ?? `HTTP ${res.status}` };
    }
    return { ok: true, ts: j.ts, channel: j.channel };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  isArchived: boolean;
  /** Member count when Slack returns it; useful for sorting busy channels first. */
  numMembers: number | null;
}

export interface ListChannelsResult {
  ok: boolean;
  channels?: SlackChannel[];
  status?: number;
  error?: string;
}

export async function listSlackChannels(token: string): Promise<ListChannelsResult> {
  if (!token) return { ok: false, error: 'Slack access_token missing — re-connect the integration' };

  // Page through conversations.list. Slack returns 100 per page by default.
  const channels: SlackChannel[] = [];
  let cursor: string | undefined;
  try {
    do {
      const url = new URL(`${API_BASE}/conversations.list`);
      url.searchParams.set('types', 'public_channel,private_channel');
      url.searchParams.set('exclude_archived', 'true');
      url.searchParams.set('limit', '200');
      if (cursor) url.searchParams.set('cursor', cursor);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        channels?: Array<{
          id: string;
          name: string;
          is_private?: boolean;
          is_archived?: boolean;
          num_members?: number;
        }>;
        response_metadata?: { next_cursor?: string };
      };
      if (!j.ok) return { ok: false, status: res.status, error: j.error ?? `HTTP ${res.status}` };

      for (const c of j.channels ?? []) {
        if (c.is_archived) continue;
        channels.push({
          id: c.id,
          name: c.name,
          isPrivate: !!c.is_private,
          isArchived: !!c.is_archived,
          numMembers: c.num_members ?? null,
        });
      }
      cursor = j.response_metadata?.next_cursor || undefined;
    } while (cursor);

    // Sort: public first (Slack convention), then alpha.
    channels.sort((a, b) => {
      if (a.isPrivate !== b.isPrivate) return a.isPrivate ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    return { ok: true, channels };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

/**
 * Exchange an OAuth code for an access token. Called once during the
 * `/api/integrations/slack/oauth/callback` flow. Returns the token plus
 * workspace metadata we need to populate the integration row.
 */
export interface SlackOAuthResult {
  ok: boolean;
  accessToken?: string;
  teamId?: string;
  teamName?: string;
  botUserId?: string;
  scope?: string;
  error?: string;
}

export async function exchangeSlackOAuthCode({
  code,
  redirectUri,
  clientId,
  clientSecret,
}: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<SlackOAuthResult> {
  try {
    const res = await fetch(`${API_BASE}/oauth.v2.access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }).toString(),
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      access_token?: string;
      bot_user_id?: string;
      scope?: string;
      team?: { id?: string; name?: string };
    };
    if (!j.ok || !j.access_token) {
      return { ok: false, error: j.error ?? 'oauth.v2.access returned no token' };
    }
    return {
      ok: true,
      accessToken: j.access_token,
      teamId: j.team?.id,
      teamName: j.team?.name,
      botUserId: j.bot_user_id,
      scope: j.scope,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}
