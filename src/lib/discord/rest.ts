/**
 * Minimal Discord REST client for the Vercel side (NO discord.js, no gateway) —
 * just enough to DM a user with the bot token. Used by the creator-invite
 * distribution job so it runs as a resumable serverless job instead of the
 * always-on bot's slash-command loop.
 *
 * Needs DISCORD_BOT_TOKEN in the environment (same token the Railway bot uses).
 */

const DISCORD_API = 'https://discord.com/api/v10';

export interface DiscordMessagePayload {
  content?: string;
  embeds?: unknown[];
  components?: unknown[];
  flags?: number;
}

export type DmOutcome =
  | { status: 'sent' }
  | { status: 'blocked' } // recipient has DMs closed / can't be messaged (50007)
  | { status: 'rate_limited'; retryAfterMs: number }
  | { status: 'failed'; error: string };

function botHeaders(): Record<string, string> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('DISCORD_BOT_TOKEN is not set');
  return { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' };
}

async function retryAfterMs(res: Response): Promise<number> {
  const body = (await res.json().catch(() => ({}))) as { retry_after?: number };
  const secs = typeof body.retry_after === 'number' ? body.retry_after : 1;
  return Math.ceil(secs * 1000);
}

/** DM a Discord user by id. One attempt (the caller paces + retries). */
export async function sendDirectMessage(discordUserId: string, message: DiscordMessagePayload): Promise<DmOutcome> {
  try {
    // 1) Open (or reuse) the DM channel.
    const dmRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
      method: 'POST',
      headers: botHeaders(),
      body: JSON.stringify({ recipient_id: discordUserId }),
    });
    if (dmRes.status === 429) return { status: 'rate_limited', retryAfterMs: await retryAfterMs(dmRes) };
    if (!dmRes.ok) {
      const t = await dmRes.text().catch(() => '');
      if (t.includes('50007')) return { status: 'blocked' };
      return { status: 'failed', error: `open_dm_${dmRes.status}` };
    }
    const channel = (await dmRes.json()) as { id?: string };
    if (!channel.id) return { status: 'failed', error: 'no_channel_id' };

    // 2) Send the message.
    const msgRes = await fetch(`${DISCORD_API}/channels/${channel.id}/messages`, {
      method: 'POST',
      headers: botHeaders(),
      body: JSON.stringify(message),
    });
    if (msgRes.status === 429) return { status: 'rate_limited', retryAfterMs: await retryAfterMs(msgRes) };
    if (msgRes.status === 403) return { status: 'blocked' };
    if (!msgRes.ok) {
      const t = await msgRes.text().catch(() => '');
      if (t.includes('50007')) return { status: 'blocked' };
      return { status: 'failed', error: `send_${msgRes.status}` };
    }
    return { status: 'sent' };
  } catch (e) {
    return { status: 'failed', error: e instanceof Error ? e.message : 'unknown' };
  }
}
