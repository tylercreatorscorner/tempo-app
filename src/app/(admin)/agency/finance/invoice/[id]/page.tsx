import { notFound } from 'next/navigation';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { canAccessAgency } from '@/lib/agency/access';
import { createAdminClient } from '@/lib/supabase/server';
import { type InvoiceSnapshot } from '@/lib/agency/finance-model';
import { PrintInvoice } from './print';
import { z } from 'zod';
export default async function ClientInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const scope = await getWorkspaceScope(), { id } = await params;
  if (!canAccessAgency(scope) || !z.uuid().safeParse(id).success) notFound();
  const db = await createAdminClient();
  const { data, error } = await db.from('agency_client_invoices').select('id,month,status,snapshot').eq('tenant_id', scope.tenantId).eq('id', id).maybeSingle();
  if (error || !data) notFound();
  const snap = data.snapshot as InvoiceSnapshot;
  // Only client-facing amounts and billing fields are rendered; manager compensation stays private.
  return <article id="client-invoice" style={{ maxWidth: 800, margin: '32px auto', padding: 40, background: 'white', color: '#172329' }}>
    <PrintInvoice /><h1 style={{ fontSize: 32, marginBottom: 24 }}>Agency service invoice</h1>
    <h2>{snap.billing.agencyName}</h2><p style={{ whiteSpace: 'pre-line' }}>{snap.billing.agencyAddress}</p>
    <p>Invoice {data.id.slice(0, 8).toUpperCase()} · {data.status.toUpperCase()}</p><p>Invoice date: {snap.issuedDate} · Due: {snap.dueDate}</p>
    <h2 style={{ marginTop: 32, fontSize: 20 }}>Bill to</h2><p>{snap.billing.legalName}</p><p style={{ whiteSpace: 'pre-line' }}>{snap.billing.billingAddress}</p><p>{snap.billing.billingContact} · {snap.billing.billingEmail}</p>
    {snap.billing.purchaseOrder && <p>PO / reference: {snap.billing.purchaseOrder}</p>}
    <hr style={{ margin: '32px 0' }} /><p>Agency services · {data.month}</p><h2 style={{ fontSize: 28, marginTop: 16 }}>Total: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(snap.feeCents / 100)}</h2>
    <p>Payment terms: {snap.billing.netDays} days.</p><p style={{ marginTop: 32, whiteSpace: 'pre-line' }}>{snap.billing.paymentInstructions}</p>
  </article>;
}
