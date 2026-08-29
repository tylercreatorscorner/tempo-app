/**
 * GET /api/report-pdf/[token] — public PDF export of a shared client report.
 *
 * Renders the FROZEN snapshot (never a live re-query): the PDF a client
 * downloads shows exactly the numbers the share page shows, even if data was
 * re-uploaded since. Public by token (middleware PUBLIC_PATHS) — a distinct
 * /api/report-pdf prefix so the authed /api/client-reports/* admin routes
 * don't ride along.
 */
import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createAdminClient } from '@/lib/supabase/server';
import { BrandClientReportPDF } from '@/lib/pdf/brand-client-report-pdf';
import { reviveReportDates, type ClientReportSnapshot } from '@/lib/data/client-reports';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token || token.length < 8) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const supabase = await createAdminClient();
  const { data: row, error } = await supabase
    .from('client_reports')
    .select('brand_name, period_end, snapshot, revoked_at, report_type')
    .eq('token', token)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Revoked links 404 like unknown ones — don't confirm a revoked token exists.
  if (!row || row.revoked_at) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const snapshot = row.snapshot as ClientReportSnapshot;
    const data = reviveReportDates(snapshot.report);
    // The PDF must carry the same sections as the web view for the same link.
    // report_type lives on the ROW, not in the frozen snapshot, so an older
    // report renders as 'performance' — which is exactly what it is.
    const docElement = BrandClientReportPDF({
      data,
      reportType: (row.report_type as 'performance' | 'weekly' | 'monthly' | null) ?? 'performance',
      // movers live on the SNAPSHOT, not on report data — they are period
      // comparison rather than period content — so they are passed separately.
      movers: snapshot.movers ?? null,
    });
    const pdf = await renderToBuffer(docElement);

    const safeBrand = String(row.brand_name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const filename = `${safeBrand}-report-${String(row.period_end)}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    console.error('[report-pdf] render failed:', err);
    return NextResponse.json({ error: 'Failed to render PDF' }, { status: 500 });
  }
}
