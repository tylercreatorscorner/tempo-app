import { getClientReportMediaUrl } from '@/lib/data/client-report-media';
import { getTikTokVideoCover, parseTikTokVideoUrl } from '@/lib/media/tiktok-video-cover';

export const runtime = 'nodejs';
export const maxDuration = 30;

const unavailable = (status: number) => new Response(null, {
  status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
});

/** Bearer-token media for saved report videos, never a general public image proxy. */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    if (!/^[A-Za-z0-9_-]{8,200}$/.test(token)) return unavailable(404);
    const input = new URL(request.url).searchParams.get('url') ?? '';
    const video = parseTikTokVideoUrl(input);
    if (!video || video.url !== input) return unavailable(400);
    const authorizedUrl = await getClientReportMediaUrl(token, video.url);
    if (!authorizedUrl) return unavailable(404);
    const cover = await getTikTokVideoCover(authorizedUrl);
    if (!cover) return unavailable(404);
    return new Response(new Uint8Array(cover.bytes), { headers: {
      'Content-Type': cover.contentType,
      'Content-Length': String(cover.bytes.byteLength),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    } });
  } catch {
    // Token, provider, and database details must not reach public responses or logs.
    return unavailable(503);
  }
}
