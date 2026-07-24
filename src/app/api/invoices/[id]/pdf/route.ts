/**
 * GET /api/invoices/[id]/pdf
 *
 * Streams a generated PDF for the invoice. Uses @react-pdf/renderer on
 * the server (Node runtime). Filename: TEMPO-{invoice_number}.pdf
 */
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';
import { renderInvoicePdf, invoiceRowToPdfData } from '@/lib/invoices/pdf';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!scope.canViewFinance) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await ctx.params;
  const supabase = await createAdminClient();

  const { data: invoice, error } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Managers may only pull PDFs for their own brands' invoices.
  if (
    scope.brandScope.kind === 'scoped' &&
    !(invoice.brand && scope.brandScope.brandSlugs.includes(invoice.brand))
  ) {
    return NextResponse.json({ error: 'Forbidden: brand not in your access' }, { status: 403 });
  }

  // Resolve brand display name
  const { data: brandRow } = await supabase
    .from('brands_v2')
    .select('name')
    .eq('slug', invoice.brand)
    .maybeSingle();

  // Shared row→PDF mapper (also used by the share download and the email
  // attachment) so every PDF renders from identical data.
  const data = invoiceRowToPdfData(invoice, brandRow?.name ?? invoice.brand);

  const pdfBuffer = await renderInvoicePdf(data);

  // Filename: "BrandName_Month-Year.pdf" (e.g. "Cata-Kor_April-2026.pdf").
  // Sanitize brand name to safe ASCII filename chars; collapse whitespace.
  const safeBrand = (brandRow?.name ?? invoice.brand)
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  const [yyyy, mm] = invoice.period_month.split('-').map(Number);
  const monthLabel = new Date(Date.UTC(yyyy, (mm ?? 1) - 1, 1))
    .toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  const filename = `${safeBrand}_${monthLabel}-${yyyy}.pdf`;

  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
