import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require-admin';
import { InvoicingClient } from './invoicing-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Invoicing — Tempo' };

interface Props {
  searchParams: Promise<{ id?: string }>;
}

export default async function InvoicingPage({ searchParams }: Props) {
  const profile = await requireAdmin();
  if (!profile) redirect('/dashboard');

  const params = await searchParams;

  return <InvoicingClient initialOpenId={params.id ?? null} />;
}
