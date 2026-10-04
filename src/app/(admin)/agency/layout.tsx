import { redirect } from 'next/navigation';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { canAccessAgency } from '@/lib/agency/access';

export const dynamic = 'force-dynamic';

export default async function AgencyLayout({ children }: { children: React.ReactNode }) {
  const scope = await getWorkspaceScope();
  if (!scope) redirect('/login');
  if (!canAccessAgency(scope)) redirect('/dashboard');
  return <div key={`${scope.tenantId}:${scope.userId}`}>{children}</div>;
}
