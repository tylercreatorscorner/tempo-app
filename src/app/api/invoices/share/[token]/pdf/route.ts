/**
 * GET /api/invoices/share/[token]/pdf
 *
 * Public, no-auth PDF download via share token. Mirrors the admin route
 * /api/invoices/[id]/pdf but is gated by token instead of admin session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { renderInvoicePdf, type InvoicePdfData } from '@/lib/invoices/pdf';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token || typeof token !== 'string' || token.length < 8) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  const supabase = await createAdminClient();

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('public_token', token)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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
