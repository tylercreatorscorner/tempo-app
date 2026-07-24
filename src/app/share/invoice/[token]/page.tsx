/**
 * Public invoice — /share/invoice/[token].
 *
 * Access is the opaque token alone (same model as /r client reports).
 * First non-preview open stamps viewed_at via the client-side ViewBeacon so
 * the invoicing board can show "viewed 2h ago"; operators check their own
 * links with ?preview=1. Revoking = NULLing public_token, so dead links
 * simply stop matching and land on the gone page.
 */
import { Lock } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/server';
import { todayIsoUtc } from '@/lib/finance/overdue';
import { ShareView, type ShareInvoice } from './share-view';
import { ViewBeacon } from './view-beacon';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Invoice — Tempo',
  // Don't index public invoice URLs in search engines
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ preview?: string }>;
}

function GonePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fbfbfd] p-6">
      <div className="max-w-sm rounded-2xl border border-[#e7e7f2] bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#f2f1f8] text-[#8a8fb0]">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="text-base font-bold text-[#171a33]">This invoice link is no longer active</h1>
        <p className="mt-2 text-sm leading-relaxed text-[#6b7093]">
          Ask your Creators Corner contact for a fresh link.
        </p>
      </div>
    </div>
  );
}

export default async function InvoiceSharePage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  if (!token || token.length < 8) return <GonePage />;

  const supabase = await createAdminClient();
  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('public_token', token)
    .maybeSingle();
  if (!invoice) return <GonePage />;

  const { data: brandRow } = await supabase
    .from('brands_v2')
    .select('name')
    .eq('slug', invoice.brand)
    .maybeSingle();

  // viewed_at is stamped by the client-side ViewBeacon, NOT here: pasting the
  // link into Slack/iMessage makes the platform's unfurl bot GET this page
  // immediately, and a server-side stamp would show "viewed" on the board
  // before the brand ever opened it. Bots don't run JS.
  const isPreview = sp?.preview === '1';

  const data: ShareInvoice = {
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    brand: invoice.brand,
    brandName: brandRow?.name ?? invoice.brand,
    periodMonth: invoice.period_month,
    generatedAt: invoice.generated_at,
    dueDate: invoice.due_date,
    paidAt: invoice.paid_at,
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
    shareNote: invoice.share_note ?? null,
    paymentInstructions: invoice.payment_instructions,
    billTo: {
      name: invoice.bill_to_name,
      email: invoice.bill_to_email,
      address: invoice.bill_to_address,
    },
    // Bill-FROM snapshot (who issued the invoice) — the share view renders
    // this, with the legacy business name only as a fallback for invoices
    // created before the snapshot columns existed.
    billFrom: {
      name: invoice.bill_from_name,
      email: invoice.bill_from_email,
      address: invoice.bill_from_address,
    },
    creators: Array.isArray(invoice.creator_breakdown) ? invoice.creator_breakdown : [],
  };

  return (
    <>
      <ViewBeacon token={token} preview={isPreview} />
      <ShareView token={token} invoice={data} todayIso={todayIsoUtc()} />
    </>
  );
}
