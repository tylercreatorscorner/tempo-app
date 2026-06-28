import { isPlatformAdmin, getActiveTenantId, getActiveManagerId } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@/lib/supabase/server';
import { ManagerSwitcher } from './manager-switcher';

/** Server wrapper: platform-admin-gated; lists the active tenant's managers.
 *  Managers belong to a tenant, so the switcher only shows once a tenant is
 *  selected (or while already impersonating, so you can still exit). */
export async function ManagerSwitcherServer() {
  if (!(await isPlatformAdmin())) return null;

  const [activeTenantId, activeManagerId] = await Promise.all([getActiveTenantId(), getActiveManagerId()]);
  if (!activeTenantId && !activeManagerId) return null;

  const admin = await createAdminClient();
  let q = admin.from('user_profiles').select('user_id, name, email').eq('role', 'manager');
  if (activeTenantId) q = q.eq('tenant_id', activeTenantId);
  const { data } = await q.order('name');

  const managers = (data ?? []).map((m) => ({
    id: m.user_id as string,
    name: (m.name as string | null) ?? (m.email as string | null) ?? 'Manager',
  }));

  return <ManagerSwitcher managers={managers} activeManagerId={activeManagerId} />;
}
