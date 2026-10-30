import { NextRequest, NextResponse } from 'next/server';
import { getClientReportVideoLibrary } from '@/lib/data/client-report-videos';
import { filterReportVideos } from '@/lib/data/published-video-evidence-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const PRIVATE = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' };

function cell(value: string | number | null): string {
  if (value === null) return '';
  let text = String(value);
  // Neutralize formulas even when creators put whitespace before a trigger.
  if (/^\s*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const library = await getClientReportVideoLibrary(token);
    if (!library) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: PRIVATE });
    if (!library.evidence) return NextResponse.json({ error: library.unavailableReason || 'Video records are unavailable.' }, { status: 503, headers: PRIVATE });
    const params = req.nextUrl.searchParams;
    const videos = filterReportVideos(library, { creator: params.get('creator') || undefined, q: params.get('q') || undefined });
    const header = ['Video ID', 'Creator', 'Published', 'TikTok URL', 'Title', 'Evidence basis', 'Evidence captured at', 'Reported published total', 'Recorded video total'];
    const rows = videos.map(video => [
      // Excel otherwise rounds 19-digit TikTok IDs and destroys their identity.
      `'${video.videoId}`, `@${video.creatorHandle}`, video.publishedAt, video.watchUrl, video.title,
      library.basis === 'frozen' ? 'Saved with report' : 'Reconstructed from current records',
      library.evidence!.capturedAt, library.reportCount, library.evidence!.total,
    ]);
    const name = library.brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'brand';
    const csv = '\uFEFF' + [header, ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
    return new NextResponse(csv, { headers: {
      ...PRIVATE, 'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}-published-videos-${library.evidence.periodStart}-to-${library.evidence.periodEnd}.csv"`,
    } });
  } catch {
    return NextResponse.json({ error: 'The report video library could not be loaded. Please try again shortly.' }, { status: 503, headers: PRIVATE });
  }
}
