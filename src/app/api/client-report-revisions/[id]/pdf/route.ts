import { renderToBuffer } from '@react-pdf/renderer';
import { BrandClientReportPDF } from '@/lib/pdf/brand-client-report-pdf';
import { reportVideoCovers } from '@/lib/pdf/report-artwork';
import { brandLogoDataUri } from '@/lib/brand-logo';
import { reviveReportDates } from '@/lib/data/client-reports';
import { loadClientReportRevisionDraft, privateReportDraftFailure, privateReportDraftRoutes, privateReportDraftLogoUrl, PRIVATE_REPORT_HEADERS } from '@/lib/data/client-report-revision-drafts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const draft = await loadClientReportRevisionDraft(id);
    const snapshot = draft.snapshot;
    const data = reviveReportDates(snapshot.report);
    const videos = [...data.creatorsCorner.topVideos.slice(0, 5), ...(data.topVideos ?? [])];
    const groups = Array.from({ length: Math.ceil(videos.length / 5) }, (_, index) => videos.slice(index * 5, index * 5 + 5));
    const [logo, coverGroups] = await Promise.all([
      privateReportDraftLogoUrl(draft).then(brandLogoDataUri),
      Promise.all(groups.map(reportVideoCovers)),
    ]);
    const videoCovers = Object.assign({}, ...coverGroups);
    const pdf = await renderToBuffer(BrandClientReportPDF({
      data, notes: draft.notes, plan: draft.plan, reportType: draft.report_type, privateRevision: true,
      movers: snapshot.movers, weekly: snapshot.weekly ?? [], generatedAt: snapshot.generatedAt,
      logo, videoCovers, reportUrl: new URL(privateReportDraftRoutes(draft.id).report, req.url).href,
    }));
    return new Response(new Uint8Array(pdf), { headers: {
      ...PRIVATE_REPORT_HEADERS, 'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="private-report-revision-${draft.period_end}.pdf"`,
    } });
  } catch (error) { return privateReportDraftFailure(error); }
}
