import { isPlatformAdmin, getAllTenants, getActiveTenantId } from '@/lib/auth/platform-admin';
import { TenantSwitcher } from './tenant-switcher';

export async function TenantSwitcherServer() {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) return null;

  const [tenants, activeTenantId] = await Promise.all([getAllTenants(), getActiveTenantId()]);

  return <TenantSwitcher tenants={tenants} activeTenantId={activeTenantId} />;
}
