import { isPlatformAdmin, getAllTenants, getActiveTenantId, getActiveManagerId } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@/lib/supabase/server';
import { TenantSwitcher } from './tenant-switcher';

/** One platform-admin control: switch tenant + (within a tenant) "view as" a
 *  brand-scoped member (manager or coach). Targets are fetched only when a
 *  tenant is active. */
export async function TenantSwitcherServer() {
  if (!(await isPlatformAdmin())) return null;

  const [tenants, activeTenantId, activeManagerId] = await Promise.all([
    getAllTenants(), getActiveTenantId(), getActiveManagerId(),
  ]);

  let managers: { id: string; name: string; role: string }[] = [];
  if (activeTenantId) {
    const admin = await createAdminClient();
    const { data } = await admin
      .from('user_profiles')
      .select('user_id, name, email, role')
      .in('role', ['manager', 'coach'])
      .eq('tenant_id', activeTenantId)
      .order('name');
    managers = (data ?? []).map((m) => ({
      id: m.user_id as string,
      name: (m.name as string | null) ?? (m.email as string | null) ?? 'Manager',
      role: (m.role as string | null) ?? 'manager',
    }));
  }

  return (
    <TenantSwitcher
      tenants={tenants}
      activeTenantId={activeTenantId}
      managers={managers}
      activeManagerId={activeManagerId}
    />
  );
}
