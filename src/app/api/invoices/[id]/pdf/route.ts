/**
 * GET /api/invoices/[id]/pdf
 *
 * Streams a generated PDF for the invoice. Uses @react-pdf/renderer on
 * the server (Node runtime). Filename: TEMPO-{invoice_number}.pdf
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';
import { renderInvoicePdf, type InvoicePdfData } from '@/lib/invoices/pdf';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await ctx.params;
  const supabase = await createAdminClient();

  const { data: invoice, error } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Resolve brand display name
  const { data: brandRow } = await supabase
    .from('brands_v2')
    .select('name')
    .eq('slug', invoice.brand)
    .maybeSingle();

  const data: InvoicePdfData = {
    invoiceNumber: invoice.invoice_number,
    brandSlug: invoice.brand,
    brandName: brandRow?.name ?? invoice.brand,
    periodMonth: invoice.period_month,
    generatedAt: invoice.generated_at,
    dueDate: invoice.due_date,
    status: invoice.status,
    affiliateGmv: Number(invoice.affiliate_gmv ?? 0),
    marketingGmv: Number(invoice.marketing_gmv ?? 0),
    totalGmv: Number(invoice.total_gmv ?? 0),
    commission: Number(invoice.commission ?? 0),
    retainer: Number(invoice.retainer ?? 0),
    productRetainer: Number(invoice.product_retainer ?? 0),
    launchFee: Number(invoice.launch_fee ?? 0),
    totalAmount: Number(invoice.total_amount ?? 0),
    notes: invoice.notes,
    paymentInstructions: invoice.payment_instructions,
    billTo: {
      name: invoice.bill_to_name,
      email: invoice.bill_to_email,
      address: invoice.bill_to_address,
    },
    billFrom: {
      name: invoice.bill_from_name,
      email: invoice.bill_from_email,
      address: invoice.bill_from_address,
    },
    creators: Array.isArray(invoice.creator_breakdown)
      ? invoice.creator_breakdown.map((c: { name?: string; gmv?: number; rate?: number; commission?: number }) => ({
          name: String(c.name ?? ''),
          gmv: Number(c.gmv ?? 0),
          rate: Number(c.rate ?? 0),
          commission: Number(c.commission ?? 0),
        }))
      : [],
  };

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
