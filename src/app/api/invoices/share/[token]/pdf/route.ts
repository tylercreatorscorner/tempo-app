/**
 * GET /api/invoices/share/[token]/pdf
 *
 * Public, no-auth PDF download via share token. Mirrors the admin route
 * /api/invoices/[id]/pdf but is gated by token instead of admin session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { renderInvoicePdf, invoiceRowToPdfData } from '@/lib/invoices/pdf';

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
    .select('name, color')
    .eq('slug', invoice.brand)
    .maybeSingle();

  // Shared row→PDF mapper (also used by the admin download and the email
  // attachment) so every PDF renders from identical data.
  const data = invoiceRowToPdfData(invoice, { name: brandRow?.name ?? invoice.brand, color: brandRow?.color });

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
