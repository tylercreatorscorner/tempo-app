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

// Discord channel types we care about for "post a message here" UX.
// Full list: https://discord.com/developers/docs/resources/channel#channel-object-channel-types
//   0  = GUILD_TEXT (regular text channel)
//   5  = GUILD_ANNOUNCEMENT (announcement channel)
//   15 = GUILD_FORUM (forums need threads, but we can post the OP)
const POSTABLE_CHANNEL_TYPES = new Set([0, 5]);

export interface DiscordChannel {
  id: string;
  name: string;
  /** Parent category name when this channel is nested inside one. */
  parentName: string | null;
  /** Order Discord uses to sort within its category. */
  position: number;
  type: number;
  /** Set when this channel is an announcement channel — useful for the UI to badge. */
  isAnnouncement: boolean;
}

interface RawChannel {
  id: string;
  name: string;
  type: number;
  position: number;
  parent_id: string | null;
}

export interface ListChannelsResult {
  ok: boolean;
  channels?: DiscordChannel[];
  status?: number;
  error?: string;
}

export async function listDiscordChannels(
  guildId: string,
  token?: string,
): Promise<ListChannelsResult> {
  const botToken = token ?? process.env.DISCORD_BOT_TOKEN;
  if (!botToken) return { ok: false, error: 'DISCORD_BOT_TOKEN env var is not set' };
  if (!guildId.match(/^\d{15,25}$/)) {
    return { ok: false, error: 'guildId must be a numeric Discord snowflake' };
  }

  try {
    const res = await fetch(`${API_BASE}/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let parsedMessage = `HTTP ${res.status}`;
      try {
        const j = JSON.parse(body) as { message?: string };
        if (j.message) parsedMessage = j.message;
      } catch { if (body) parsedMessage = body.slice(0, 200); }
      return { ok: false, status: res.status, error: parsedMessage };
    }

    const raw = (await res.json()) as RawChannel[];

    // Build category lookup so we can label channels with their parent.
    const categories = new Map<string, string>();
    for (const c of raw) {
      // 4 = GUILD_CATEGORY
      if (c.type === 4) categories.set(c.id, c.name);
    }

    const channels = raw
      .filter(c => POSTABLE_CHANNEL_TYPES.has(c.type))
      .map<DiscordChannel>(c => ({
        id: c.id,
        name: c.name,
        parentName: c.parent_id ? categories.get(c.parent_id) ?? null : null,
        position: c.position,
        type: c.type,
        isAnnouncement: c.type === 5,
      }))
      // Sort: by category name, then by Discord-assigned position within category.
      .sort((a, b) => {
        const ca = a.parentName ?? '~~uncategorized~~';
        const cb = b.parentName ?? '~~uncategorized~~';
        if (ca !== cb) return ca.localeCompare(cb);
        return a.position - b.position;
      });

    return { ok: true, channels };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

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
