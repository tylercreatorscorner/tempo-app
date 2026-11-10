import { getTikTokVideoCover } from '@/lib/media/tiktok-video-cover';
import { loadClientReportRevisionDraft, PrivateReportDraftError, privateReportDraftFailure, privateReportDraftMediaUrl, PRIVATE_REPORT_HEADERS } from '@/lib/data/client-report-revision-drafts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const draft = await loadClientReportRevisionDraft(id);
    const url = privateReportDraftMediaUrl(draft, new URL(req.url).searchParams.get('url') ?? '');
    if (!url) throw new PrivateReportDraftError(404);
    const cover = await getTikTokVideoCover(url);
    if (!cover) throw new PrivateReportDraftError(404);
    return new Response(new Uint8Array(cover.bytes), { headers: {
      ...PRIVATE_REPORT_HEADERS, 'Content-Type': cover.contentType,
      'Content-Length': String(cover.bytes.byteLength), 'Content-Disposition': 'inline',
    } });
  } catch (error) { return privateReportDraftFailure(error); }
}
