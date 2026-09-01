/**
 * Brand Client Report — PDF download endpoint.
 *
 * Renders the multi-page polished brand client report (cover · executive
 * summary · KPIs · managed/organic · new/returning · day-of-week ·
 * top creators · top videos · top products · per-product creator breakdown).
 * This replaces the throwaway one-pager with a deck-quality report matching
 * the old Netlify dashboard's report.
 *
 * Forced to Node.js runtime — @react-pdf/renderer needs Node APIs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { getBrandClientReportData, type ReportPeriod } from '@/lib/data/brand-client-report';
import { BrandClientReportPDF } from '@/lib/pdf/brand-client-report-pdf';
import { getBrandRegistry, brandLabel } from '@/lib/data/brand-registry';
import { getWorkspaceScope, isBrandInScope } from '@/lib/auth/workspace-scope';

export const runtime = 'nodejs';
// Allow up to 60s for the heavy multi-table data pull + PDF render
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const brand = searchParams.get('brand') || 'all';

  // Scope guard: a client report exposes a full brand's data. Only let the
  // caller pull reports for brands in their scope (owner/admin = all; the
  // all-brands report is owner/admin only). Without this any workspace user
  // could download any brand's report by changing ?brand=.
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (brand === 'all' ? scope.brandScope.kind !== 'all' : !isBrandInScope(scope, { slug: brand })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // Custom date range (start/end) takes precedence over the 7d/30d preset.
  const startParam = searchParams.get('start');
  const endParam = searchParams.get('end');
  const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const period: ReportPeriod | { start: string; end: string } =
    isDate(startParam) && isDate(endParam)
      ? { start: startParam, end: endParam }
      : (searchParams.get('period') === '30d' ? '30d' : '7d');
  const customRange = typeof period === 'object';
  const reg = await getBrandRegistry();
  const brandName = brand === 'all'
    ? 'All Brands'
    : (searchParams.get('name') || brandLabel(reg, brand));

  try {
    const data = await getBrandClientReportData(brand, brandName, period);
    // Call as function — renderToBuffer needs a ReactElement<DocumentProps>, not a wrapper
    // Which template to render. The frozen-token route reads this from the
    // client_reports row; here it is a query param so an admin can pull a
    // monthly or weekly PDF live without first freezing a shareable link.
    const rt = searchParams.get('reportType');
    const docElement = BrandClientReportPDF({
      data,
      reportType: rt === 'monthly' || rt === 'weekly' ? rt : 'performance',
    });
    const pdf = await renderToBuffer(docElement);

    const safeBrand = brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const dateStamp = data.endDate.toISOString().slice(0, 10);
    const periodTag = customRange ? 'custom' : (period === '30d' ? 'monthly' : 'weekly');
    const filename = `${safeBrand}-${periodTag}-report-${dateStamp}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    console.error('Brand client PDF error:', err);
    const message = err instanceof Error ? err.message : 'Failed to generate PDF';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
