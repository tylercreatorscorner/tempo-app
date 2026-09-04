/**
 * Brand logos for PDF rendering.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * 🚨 @react-pdf DOES NOT THROW ON A FORMAT IT CANNOT READ, IT DRAWS NOTHING.
 * Handed a webp it logs "Base64 image invalid format: webp" to stderr and
 * returns a perfectly valid PDF with the image silently absent (measured: 1,510
 * bytes with no image against 31,522 with one). That is worse than a crash,
 * because a crash would be caught in review and this ships a client-facing
 * document that is quietly missing its branding.
 *
 * SIX OF THE FOURTEEN uploaded logos are webp, and they are the big accounts:
 * Cata-Kor, Dr. Dent, JiYu, M3, Bondie, Nello. Passing stored logos straight
 * through would have "worked" for the eight PNG brands and silently dropped the
 * logo for the six that matter most.
 *
 * ⚠️ The invoice PDF's standing comment said to wire logos "once logos are
 * stored and served from our own bucket". Both are true now (14 uploaded,
 * bucket public, verified 200 image/webp), so the blocker it names is stale.
 * The blocker it did NOT name is the format, which is the real one.
 *
 * ── Rules ───────────────────────────────────────────────────────────────────
 *
 * ⚠️ EVERY failure returns null and the caller keeps its existing fallback (the
 * coloured initials chip). A logo is decoration on a document about money; it
 * must never be able to fail a render, delay one noticeably, or blank a page.
 * Hence the timeout, the byte cap, and the catch-all.
 */
import sharp from 'sharp';

/** Formats @react-pdf can embed directly. Everything else is converted. */
const PASSTHROUGH = new Set(['image/png', 'image/jpeg']);

/** Logos render at roughly 40px. 320 is generous for retina and keeps the
 *  encoded payload near 14KB rather than the 30KB a full-size re-encode costs. */
const MAX_EDGE = 320;

/** A logo should be a few KB. Anything past this is not a logo, and decoding it
 *  would be work done on behalf of whoever uploaded it. */
const MAX_BYTES = 2 * 1024 * 1024;

/** Fetching must not hold a PDF render open. */
const TIMEOUT_MS = 4000;

/**
 * Process-lifetime cache. Logos change roughly never, and a warm lambda
 * rendering several PDFs should convert each brand once. Bounded so a long-run
 * process cannot grow without limit.
 */
const cache = new Map<string, string | null>();
const CACHE_MAX = 64;

/**
 * A PNG/JPEG data URI for `url`, or null if it cannot be produced.
 *
 * Null is a normal outcome, not an error: no logo uploaded, a slow bucket, an
 * unreadable file. Callers render their fallback.
 */
export async function brandLogoDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url || !url.trim()) return null;
  const key = url.trim();

  if (cache.has(key)) return cache.get(key) ?? null;

  const result = await load(key);

  // Cheapest possible eviction: the map is small and insertion-ordered.
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, result);
  return result;
}

async function load(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      console.error('[brand-logo] fetch failed', res.status, url);
      return null;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) {
      console.error('[brand-logo] unusable size', buf.length, url);
      return null;
    }

    // ⚠️ Trust the BYTES, not the URL extension and not the header alone: the
    // bucket serves whatever was uploaded, and a .png that is really a webp
    // would pass an extension check and then render as nothing.
    const meta = await sharp(buf).metadata();
    const format = meta.format ? `image/${meta.format === 'jpg' ? 'jpeg' : meta.format}` : '';

    if (PASSTHROUGH.has(format) && Math.max(meta.width ?? 0, meta.height ?? 0) <= MAX_EDGE) {
      return `data:${format};base64,${buf.toString('base64')}`;
    }

    const png = await sharp(buf)
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch (e) {
    // Includes the abort on timeout. Never rethrow: see the header note.
    console.error('[brand-logo] could not prepare', url, (e as Error).message);
    return null;
  }
}
