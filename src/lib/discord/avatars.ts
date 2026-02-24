/**
 * Discord avatar fetching utility with in-memory cache.
 */

interface DiscordUser {
  id: string;
  avatar: string | null;
}

const avatarCache = new Map<string, { avatar: string | null; fetchedAt: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function fetchDiscordAvatars(
  discordIds: string[]
): Promise<Record<string, string | null>> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return {};

  const result: Record<string, string | null> = {};
  const toFetch: string[] = [];

  for (const id of discordIds) {
    const cached = avatarCache.get(id);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      result[id] = cached.avatar;
    } else {
      toFetch.push(id);
    }
  }

  // Fetch in parallel, max 10 concurrent to avoid rate limits
  const batchSize = 10;
  for (let i = 0; i < toFetch.length; i += batchSize) {
    const batch = toFetch.slice(i, i + batchSize);
    const promises = batch.map(async (id) => {
      try {
        const res = await fetch(`https://discord.com/api/v10/users/${id}`, {
          headers: { Authorization: `Bot ${token}` },
        });
        if (!res.ok) {
          result[id] = null;
          avatarCache.set(id, { avatar: null, fetchedAt: Date.now() });
          return;
        }
        const user: DiscordUser = await res.json();
        const avatarUrl = user.avatar
          ? `https://cdn.discordapp.com/avatars/${id}/${user.avatar}.png?size=64`
          : null;
        result[id] = avatarUrl;
        avatarCache.set(id, { avatar: avatarUrl, fetchedAt: Date.now() });
      } catch {
        result[id] = null;
        avatarCache.set(id, { avatar: null, fetchedAt: Date.now() });
      }
    });
    await Promise.all(promises);
  }

  return result;
}
