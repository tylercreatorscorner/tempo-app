import { notFound } from 'next/navigation';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { canAccessAgency } from '@/lib/agency/access';
import { createAdminClient } from '@/lib/supabase/server';
import { type InvoiceSnapshot } from '@/lib/agency/finance-model';
import { AgencyInvoiceDocument } from './document';
import { z } from 'zod';
export default async function ClientInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const scope = await getWorkspaceScope(), { id } = await params;
  if (!canAccessAgency(scope) || !z.uuid().safeParse(id).success) notFound();
  const db = await createAdminClient();
  const { data, error } = await db.from('agency_client_invoices').select('id,month,status,snapshot').eq('tenant_id', scope.tenantId).eq('id', id).maybeSingle();
  if (error || !data) notFound();
  const snap = data.snapshot as InvoiceSnapshot;
  return <AgencyInvoiceDocument invoice={{ id: data.id, month: data.month, status: data.status, snapshot: snap }} />;
}
