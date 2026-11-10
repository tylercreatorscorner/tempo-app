import { filterReportVideos } from '@/lib/data/published-video-evidence-types';
import { loadClientReportRevisionDraft, PrivateReportDraftError, privateReportDraftFailure, privateReportDraftVideoLibrary, PRIVATE_REPORT_HEADERS } from '@/lib/data/client-report-revision-drafts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cell(value: string | number | null): string {
  if (value === null) return '';
  let text = String(value);
  if (/^\s*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const draft = await loadClientReportRevisionDraft(id);
    const library = privateReportDraftVideoLibrary(draft);
    if (!library.evidence) throw new PrivateReportDraftError(503);
    const params = new URL(req.url).searchParams;
    const videos = filterReportVideos(library, { creator: params.get('creator') || undefined, q: params.get('q') || undefined });
    const rows = videos.map(video => [`'${video.videoId}`, `@${video.creatorHandle}`, video.publishedAt,
      video.watchUrl, video.title, 'Saved with private revision', library.evidence!.capturedAt, library.reportCount, library.evidence!.total]);
    const header = ['Video ID', 'Creator', 'Published', 'TikTok URL', 'Title', 'Evidence basis', 'Evidence captured at', 'Reported published total', 'Recorded video total'];
    return new Response('\uFEFF' + [header, ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n', { headers: {
      ...PRIVATE_REPORT_HEADERS, 'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="private-revision-videos-${draft.period_end}.csv"`,
    } });
  } catch (error) { return privateReportDraftFailure(error); }
}
