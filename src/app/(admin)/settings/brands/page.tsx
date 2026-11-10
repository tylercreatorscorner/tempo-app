import { redirect } from 'next/navigation';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { can } from '@/lib/auth/permissions';
import { BrandsSettingsClient } from './brands-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Brand Settings — Tempo' };

export default async function BrandsSettingsPage() {
  const scope = await getWorkspaceScope();
  if (!scope?.tenantId || !['owner', 'admin'].includes(scope.role) || !can(scope, 'settings', 'read')) redirect('/dashboard');
  return <BrandsSettingsClient
    canEditBrand={!scope.impersonating && can(scope, 'settings', 'write')}
    canEditBilling={!scope.impersonating && can(scope, 'earnings', 'read') && can(scope, 'earnings', 'configure')}
  />;
}
