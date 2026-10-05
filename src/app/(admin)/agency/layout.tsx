import { redirect } from 'next/navigation';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { canAccessAgency } from '@/lib/agency/access';
import styles from './agency.module.css';

export const dynamic = 'force-dynamic';

export default async function AgencyLayout({ children }: { children: React.ReactNode }) {
  const scope = await getWorkspaceScope();
  if (!scope) redirect('/login');
  if (!canAccessAgency(scope)) redirect('/dashboard');
  return <div className={styles.canvas} key={`${scope.tenantId}:${scope.userId}`}>{children}</div>;
}
