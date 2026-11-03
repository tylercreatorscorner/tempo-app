import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { can } from '@/lib/auth/permissions';
import { getTikTokVideoCover, parseTikTokVideoUrl } from '@/lib/media/tiktok-video-cover';

export const maxDuration = 30;

const unavailable = (status: number) => new Response(null, {
  status, headers: { 'Cache-Control': 'private, no-store' },
});

/** Resolves public TikTok covers only. No arbitrary image proxy or Tempo data lookup. */
export async function GET(request: Request) {
  try {
    const scope = await getWorkspaceScope();
    if (!scope) return unavailable(401);
    if (!can(scope, 'dashboard', 'read') && !can(scope, 'roster', 'read')) return unavailable(403);
    if (scope.brandScope.kind === 'scoped'
      && !scope.brandScope.brandIds.length && !scope.brandScope.brandSlugs.length) return unavailable(403);
    const input = new URL(request.url).searchParams.get('url') ?? '';
    const video = parseTikTokVideoUrl(input);
    if (!video) return unavailable(400);
    const cover = await getTikTokVideoCover(video.url);
    if (!cover) return unavailable(404);
    return new Response(new Uint8Array(cover.bytes), { headers: {
      'Content-Type': cover.contentType,
      'Content-Length': String(cover.bytes.byteLength),
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    } });
  } catch {
    console.warn('[dashboard-video-cover] Cover request failed');
    return unavailable(503);
  }
}
