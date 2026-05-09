/**
 * Discord action: send a single message to a channel.
 *
 * Uses the Discord HTTPS API directly (not the persistent bot client at
 * scripts/tempo-bot.ts) so this works from a stateless Next.js route
 * without needing the bot process to be online.
 *
 * Bot token comes from env: DISCORD_BOT_TOKEN.
 */

export interface DiscordSendResult {
  ok: boolean;
  /** Discord message id on success */
  messageId?: string;
  /** Status code from Discord on failure */
  status?: number;
  /** Discord error message on failure */
  error?: string;
}

const API_BASE = 'https://discord.com/api/v10';

interface SendArgs {
  channelId: string;
  content: string;
  /** Override bot token (used for testing). Defaults to env. */
  token?: string;
}

export async function sendDiscordMessage({ channelId, content, token }: SendArgs): Promise<DiscordSendResult> {
  const botToken = token ?? process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    return { ok: false, error: 'DISCORD_BOT_TOKEN env var is not set' };
  }
  if (!channelId.match(/^\d{15,25}$/)) {
    return { ok: false, error: 'channelId must be a numeric Discord snowflake (15-25 digits)' };
  }
  if (!content.trim()) {
    return { ok: false, error: 'content cannot be empty' };
  }
  if (content.length > 2000) {
    return { ok: false, error: 'content exceeds Discord 2000-character limit' };
  }

  try {
    const res = await fetch(`${API_BASE}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let parsedMessage = `HTTP ${res.status}`;
      try {
        const j = JSON.parse(body) as { message?: string; code?: number };
        if (j.message) parsedMessage = j.message;
      } catch {
        if (body) parsedMessage = body.slice(0, 200);
      }
      return { ok: false, status: res.status, error: parsedMessage };
    }

    const data = (await res.json()) as { id: string };
    return { ok: true, messageId: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}
