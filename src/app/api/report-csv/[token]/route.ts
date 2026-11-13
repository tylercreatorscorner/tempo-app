/**
 * GET /api/report-csv/[token] — the creator table as a CSV.
 *
 * Same access model as the PDF export: public by opaque token, revoked links
 * 404 like unknown ones, and it reads the FROZEN snapshot rather than
 * re-querying. A client who downloads the CSV and the PDF on the same day must
 * get the same numbers, and only the snapshot guarantees that.
 *
 * ⚠️ EXPORTS NOTHING THE PAGE DOES NOT ALREADY SHOW. Same columns as the
 * on-page table, from the same array. In particular the retainer column is
 * already rendered per creator, so the CSV is not a wider disclosure than the
 * link itself.
 *
 * ⚠️ The dormant creators hidden behind the page's "show the other N" toggle
 * ARE included. The disclosure is a density decision, not a privacy one, and a
 * spreadsheet with a missing tail would be worse than useless.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { reviveReportDates, type ClientReportSnapshot } from '@/lib/data/client-reports';
import { loadCanonicalForReport } from '@/lib/data/client-report-canonical';

export const runtime = 'nodejs';

/**
 * Quote a CSV field.
 *
 * 🚨 The leading-character guard is not cosmetic. A creator name beginning
 * `=`, `+`, `-` or `@` is executed as a formula when the file is opened in
 * Excel or Sheets, and TikTok handles routinely start with `@`. Prefixing a
 * single quote neutralises it while still displaying the original text. This
 * file goes to clients, so a CSV injection here is our problem, not theirs.
 */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  // Quote whenever the field could otherwise break the row.
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token || token.length < 8) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const supabase = await createAdminClient();
  const { data: row, error } = await supabase
    .from('client_reports')
    .select('id,tenant_id,brand_slug,report_type,brand_name,period_start,period_end,snapshot,revoked_at')
    .eq('token', token)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row || row.revoked_at) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const canonical = await loadCanonicalForReport(row, supabase);
    if (canonical && canonical.token !== token) {
      const destination = new URL(_req.url);
      destination.pathname = `/api/report-csv/${encodeURIComponent(canonical.token)}`;
      return NextResponse.redirect(destination, { status: 307, headers: { 'Cache-Control': 'private, no-store' } });
    }
  } catch {
    return NextResponse.json({ error: 'The approved report revision could not be verified.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }

  const snapshot = row.snapshot as ClientReportSnapshot;
  if (snapshot.reconciliation) {
    const header=['Creator','Handle','Agreement / window','August posts','Delivery / allocation','Invoice USD','Resolution'];
    const rows=snapshot.reconciliation.rows.map(r=>[r.name,r.handle,r.agreement,r.augustPosts,r.creditedPosts,r.invoice ?? 'Unchanged',r.resolution]);
    return new NextResponse([header,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="creator-reconciliation.csv"','Cache-Control':'private, no-store'}});
  }
  const report = reviveReportDates(snapshot.report);
  const creators = report.granular?.creators ?? [];
  if (creators.length === 0) {
    return NextResponse.json({ error: 'This report has no creator detail.' }, { status: 404 });
  }

  // Keep the agreed target in its own column for every report. Only the
  // published count describes the report window; a weekly count must never
  // be presented as progress against a full-month commitment.
  const start = report.startDate;
  const end = report.endDate;
  const lastOfMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  const windowIsMonth =
    start.getUTCDate() === 1 &&
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCFullYear() === end.getUTCFullYear() &&
    end.getUTCDate() === lastOfMonth;

  const hasAgreements = creators.some(c => c.agreement);
  const header = [
    'Creator',
    'TikTok handles',
    'Recorded partnership status',
    // Unlike the report, the CSV carries this ALWAYS. A blank cell in a
    // spreadsheet is ordinary; a column of dashes on a client-facing page is
    // not, which is why the rendered table gates on coverage and this does not.
    'Level',
    'Retainer rate',
    'Retainer period',
    hasAgreements ? 'Agreed / recorded post target' : 'Recorded monthly target',
    'Post commitment period',
    'Roster start date',
    'Report inclusion note',
    windowIsMonth ? 'Posts published' : 'Posts this period',
    'Videos earning',
    'Orders',
    'Units sold',
    'GMV',
    ...(hasAgreements ? ['Agreement period start', 'Agreement period end', 'Agreement revision', 'Review required'] : []),
  ];

  const rows = creators.map((c) => {
    // Historical snapshots may omit units. Orders are never a substitute.
    const optional = c as typeof c & { units?: number | null; items?: number | null; unitsSold?: number | null };
    const units = typeof optional.items === 'number' && Number.isFinite(optional.items) ? optional.items
      : typeof optional.units === 'number' && Number.isFinite(optional.units) ? optional.units
      : typeof optional.unitsSold === 'number' && Number.isFinite(optional.unitsSold) ? optional.unitsSold : '';
    const handles =
      Array.isArray(c.handles) && c.handles.length > 0
        ? c.handles.map((h: string) => `@${String(h).replace(/^@+/, '')}`).join(' ')
        : c.handle
          ? `@${String(c.handle).replace(/^@+/, '')}`
          : '';
    return [
      c.realName?.trim() ? c.realName : c.name,
      handles,
      c.departed ? 'Left during period' : c.isAffiliate ? 'Affiliate' : !c.agreement && !(c.quota != null && c.quota > 0) ? 'Status to confirm' : c.agreement ? 'Retainer' : 'Recorded monthly rate / target',
      c.role?.trim() ? c.role : '',
      // Blank, never 0: affiliate-only creators have no agreed amount, and a
      // zero would read as a negotiated figure.
      !c.departed && !c.isAffiliate && c.retainer > 0 ? c.retainer.toFixed(2) : '',
      !c.departed && !c.isAffiliate && c.retainer > 0 ? (c.agreement ? 'Agreement term' : 'Month') : '',
      !c.departed && !c.isAffiliate ? c.quota ?? '' : '',
      !c.departed && !c.isAffiliate && c.quota != null ? (c.agreement ? 'Agreement term' : 'Month') : '',
      c.ccStartDate ?? '',
      c.ccStartDate && c.ccStartDate.slice(0, 10) > end.toISOString().slice(0, 10) ? 'Included in this report; saved roster date is later than the report window.' : '',
      c.postsPublished,
      c.videosEarning ?? '',
      c.orders,
      units,
      c.gmv.toFixed(2),
      ...(hasAgreements ? [c.agreement?.periodStart ?? '', c.agreement?.periodEnd ?? '', c.agreement?.revision ?? '', c.agreement && !c.agreement.reportPeriodComparable ? 'Agreement period / payment rules' : ''] : []),
    ];
  });

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  // BOM so Excel reads the file as UTF-8 rather than the system codepage,
  // which otherwise mangles accented creator names.
  const csv =
    '﻿' +
    [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') +
    '\r\n';

  const safeBrand = String(row.brand_name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeBrand}-creators-${fmt(start)}-to-${fmt(end)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
