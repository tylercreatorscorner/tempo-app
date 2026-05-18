import { redirect } from 'next/navigation';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { PaymentsClient } from './payments-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payments — Tempo' };

export default async function PaymentsPage() {
  // Any Workspace user; the /api/payments/* routes scope figures to brands.
  const scope = await getWorkspaceScope();
  if (!scope) redirect('/dashboard');

  return <PaymentsClient />;
}
