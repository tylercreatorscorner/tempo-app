import { reviveReportDates } from '@/lib/data/client-reports';
import { loadClientReportRevisionDraft, privateReportDraftFailure, PRIVATE_REPORT_HEADERS } from '@/lib/data/client-report-revision-drafts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cell(value: string | number | null | undefined): string {
  if (value == null) return '';
  let text = String(value);
  if (/^\s*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const draft = await loadClientReportRevisionDraft(id);
    const report = reviveReportDates(draft.snapshot.report);
    const creators = report.granular?.creators ?? [];
    const header = ['Creator', 'TikTok handles', 'Recorded relationship', 'Level', 'Recorded retainer rate',
      'Retainer rate basis', 'Recorded post target', 'Post target basis', 'Partnership start date',
      'Posts this period', 'Videos earning', 'Orders', 'Units sold', 'GMV',
      'Agreement period start', 'Agreement period end', 'Agreement revision', 'Agreement status'];
    const rows = creators.map(creator => {
      const optional = creator as typeof creator & { units?: number | null; items?: number | null; unitsSold?: number | null };
      const units = [optional.items, optional.units, optional.unitsSold].find(value => typeof value === 'number' && Number.isFinite(value));
      const handles = creator.handles?.length ? creator.handles : creator.handle ? [creator.handle] : [];
      const retained = !creator.departed && !creator.isAffiliate;
      const agreement = creator.agreement;
      return [creator.realName?.trim() || creator.name, handles.map(handle => '@' + handle.replace(/^@+/, '')).join(' '),
        creator.departed ? 'Left during period' : creator.isAffiliate ? 'Affiliate' : !agreement && !(creator.quota != null && creator.quota > 0) ? 'Relationship and target under review' : 'Retainer', creator.role || '',
        retained && creator.retainer > 0 ? creator.retainer.toFixed(2) : '',
        retained && creator.retainer > 0 ? agreement ? 'Saved agreement term' : 'Monthly rate at report end' : '',
        retained ? creator.quota ?? '' : '',
        retained && creator.quota != null ? agreement ? 'Saved agreement term' : 'Monthly target at report end' : '',
        creator.ccStartDate ?? '', creator.postsPublished, creator.videosEarning ?? '', creator.orders, units ?? '',
        creator.gmv.toFixed(2), agreement?.periodStart ?? '', agreement?.periodEnd ?? '', agreement?.revision ?? '',
        agreement ? agreement.reportPeriodComparable ? 'Saved terms comparable to report period' : 'Saved terms require period or payment review' : 'Agreement terms not saved'];
    });
    return new Response('\uFEFF' + [header, ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n', { headers: {
      ...PRIVATE_REPORT_HEADERS, 'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="private-revision-creators-${draft.period_start}-to-${draft.period_end}.csv"`,
    } });
  } catch (error) { return privateReportDraftFailure(error); }
}
