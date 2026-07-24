import { redirect } from 'next/navigation';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { InvoicingClient } from './invoicing-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Invoicing — Tempo' };

interface Props {
  searchParams: Promise<{ id?: string; view?: string }>;
}

export default async function InvoicingPage({ searchParams }: Props) {
  // Any Workspace user; /api/invoices scopes the list to their brands.
  const scope = await getWorkspaceScope();
  if (!scope) redirect('/dashboard');
  if (!scope.canViewFinance) redirect('/dashboard');

  const params = await searchParams;

  return (
    <InvoicingClient
      initialOpenId={params.id ?? null}
      initialView={params.view === 'list' ? 'list' : 'board'}
    />
  );
}
