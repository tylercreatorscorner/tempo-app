/**
 * Discord avatar fetching utility with in-memory cache.
 */

interface DiscordUser {
  id: string;
  avatar: string | null;
}

const avatarCache = new Map<string, { avatar: string | null; fetchedAt: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
let rateLimitedUntil = 0;

export async function fetchDiscordAvatars(
  discordIds: string[]
): Promise<Record<string, string | null>> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || Date.now() < rateLimitedUntil) return {};

  const result: Record<string, string | null> = {};
  const toFetch: string[] = [];

  for (const id of new Set(discordIds.filter(id => /^\d{17,20}$/.test(id)))) {
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
          signal: AbortSignal.timeout(3000),
        });
        if (res.status === 429) {
          const body = await res.json().catch(() => ({}));
          rateLimitedUntil = Date.now() + Math.max(1000, (Number(body.retry_after) || 30) * 1000);
          result[id] = null;
          return;
        }
        if (!res.ok) {
          result[id] = null;
          return;
        }
        const user: DiscordUser = await res.json();
        const avatarUrl = user.id === id && typeof user.avatar === 'string' && /^(a_)?[a-f0-9]{32}$/i.test(user.avatar)
          ? `https://cdn.discordapp.com/avatars/${id}/${user.avatar}.png?size=128`
          : null;
        result[id] = avatarUrl;
        avatarCache.set(id, { avatar: avatarUrl, fetchedAt: Date.now() });
        if (avatarCache.size > 2000) avatarCache.delete(avatarCache.keys().next().value!);
      } catch {
        result[id] = null;
      }
    });
    await Promise.all(promises);
  }

  return result;
}
