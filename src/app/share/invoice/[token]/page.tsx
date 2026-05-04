import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/server';
import { ShareView, type ShareInvoice } from './share-view';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Invoice — Tempo',
  // Don't index public invoice URLs in search engines
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ token: string }>;
}

export default async function InvoiceSharePage({ params }: Props) {
  const { token } = await params;
  if (!token || token.length < 8) notFound();

  const supabase = await createAdminClient();
  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('public_token', token)
    .maybeSingle();
  if (!invoice) notFound();

  const { data: brandRow } = await supabase
    .from('brands_v2')
    .select('name')
    .eq('slug', invoice.brand)
    .maybeSingle();

  const data: ShareInvoice = {
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    brand: invoice.brand,
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
    creators: Array.isArray(invoice.creator_breakdown) ? invoice.creator_breakdown : [],
  };

  return <ShareView token={token} invoice={data} />;
}
