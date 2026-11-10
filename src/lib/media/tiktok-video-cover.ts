/** Public TikTok artwork only. Never forward a visitor's cookies or credentials. */
type Cover = { bytes: Uint8Array; contentType: string };
type CacheEntry = { cover: Cover | null; expires: number };
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<Cover | null>>();
const MAX_ENTRIES = 100;
const MAX_IN_FLIGHT = 40;
const MAX_CACHE_BYTES = 20 * 1024 * 1024;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
let cacheBytes = 0;

export function parseTikTokVideoUrl(input: string): { url: string; videoId: string } | null {
  try {
    const url = new URL(input);
    const match = url.pathname.match(/^\/@([a-zA-Z0-9._]{1,30})\/video\/(\d{15,25})\/?$/);
    if (url.protocol !== 'https:' || url.host !== 'www.tiktok.com' || url.username || url.password || url.search || url.hash || !match) return null;
    return { url: `https://www.tiktok.com/@${match[1]}/video/${match[2]}`, videoId: match[2] };
  } catch { return null; }
}

function trustedCoverUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const trusted = ['tiktokcdn-us.com', 'tiktokcdn.com'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && trusted ? url.href : null;
  } catch { return null; }
}

async function boundedBody(response: Response, limit: number): Promise<Uint8Array> {
  const length = Number(response.headers.get('content-length'));
  if (length > limit || !response.body) throw new Error('Unavailable body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('Body limit exceeded'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

/** Check magic bytes as well as MIME; exclude GIF and animated PNG/WebP. */
function staticImage(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === 'image/jpeg') return bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const four = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (contentType === 'image/png') {
    if (bytes.length < 24 || ![137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) return false;
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset);
      const type = four(offset + 4);
      if (type === 'acTL' || type === 'fdAT') return false;
      if (offset + 12 + length > bytes.length) return false;
      if (type === 'IEND') return true;
      offset += 12 + length;
    }
    return false;
  }
  if (contentType === 'image/webp') {
    if (bytes.length < 20 || four(0) !== 'RIFF' || four(8) !== 'WEBP' || view.getUint32(4, true) + 8 !== bytes.length) return false;
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const type = four(offset);
      const length = view.getUint32(offset + 4, true);
      if (type === 'ANIM' || type === 'ANMF' || offset + 8 + length > bytes.length) return false;
      offset += 8 + length + (length % 2);
    }
    return true;
  }
  return false;
}

async function resolveCover(url: string, videoId: string): Promise<Cover | null> {
  try {
    const watch = await fetch(url, { redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(8000), headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0 (compatible; Tempo/1.0)' } });
    if (!watch.ok || !watch.headers.get('content-type')?.toLowerCase().includes('text/html')) return null;
    const html = new TextDecoder().decode(await boundedBody(watch, MAX_HTML_BYTES));
    const script = html.match(/<script\b[^>]*\bid=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
    if (!script) return null;
    const item = JSON.parse(script)?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
    // A redirect, recommendation or unrelated page must not supply another video's cover.
    if (!item || String(item.id) !== videoId) return null;
    const candidates = [...new Set([item.video?.cover, item.video?.originCover].map(trustedCoverUrl).filter((value): value is string => Boolean(value)))];
    for (const candidate of candidates) {
      try {
        const image = await fetch(candidate, { redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(8000), headers: { Accept: 'image/jpeg,image/png,image/webp' } });
        if (!image.ok) continue;
        const contentType = image.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) continue;
        const bytes = await boundedBody(image, MAX_IMAGE_BYTES);
        if (staticImage(bytes, contentType)) return { bytes, contentType };
      } catch { /* Try another static cover from this same, verified video. */ }
    }
  } catch { /* Public media availability must not break the dashboard. */ }
  return null;
}

function removeCached(key: string) {
  const entry = cache.get(key);
  if (entry?.cover) cacheBytes -= entry.cover.bytes.byteLength;
  cache.delete(key);
}

/** Bounded per-instance cache of public image bytes; transient failures retry. */
export async function getTikTokVideoCover(input: string): Promise<Cover | null> {
  const parsed = parseTikTokVideoUrl(input);
  if (!parsed) return null;
  const found = cache.get(parsed.url);
  if (found && found.expires > Date.now()) {
    cache.delete(parsed.url); cache.set(parsed.url, found);
    return found.cover;
  }
  if (found) removeCached(parsed.url);
  const pending = inFlight.get(parsed.url);
  if (pending) return pending;
  if (inFlight.size >= MAX_IN_FLIGHT) return null;
  const request = resolveCover(parsed.url, parsed.videoId).then(cover => {
    for (const [key, entry] of cache) if (entry.expires <= Date.now()) removeCached(key);
    cache.set(parsed.url, { cover, expires: Date.now() + (cover ? 6 * 60 * 60 * 1000 : 30 * 1000) });
    cacheBytes += cover?.bytes.byteLength ?? 0;
    while (cache.size > MAX_ENTRIES || cacheBytes > MAX_CACHE_BYTES) removeCached(cache.keys().next().value!);
    return cover;
  }).finally(() => inFlight.delete(parsed.url));
  inFlight.set(parsed.url, request);
  return request;
}
