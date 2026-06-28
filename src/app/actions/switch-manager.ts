'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { ACTIVE_MANAGER_COOKIE, isPlatformAdmin, getActiveTenantId } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Platform-admin "view as": start (userId) or exit (null) impersonating a member.
 * Only platform admins can set it; the target must be a manager (in the active
 * tenant, when one is selected). Read-only is enforced separately in middleware.
 */
export async function switchManager(userId: string | null) {
  if (!(await isPlatformAdmin())) return;

  const jar = await cookies();
  if (userId) {
    const activeTenantId = await getActiveTenantId();
    const admin = await createAdminClient();
    let q = admin.from('user_profiles').select('user_id').eq('user_id', userId).eq('role', 'manager');
    if (activeTenantId) q = q.eq('tenant_id', activeTenantId);
    const { data } = await q.maybeSingle();
    if (!data) return; // not a valid manager to impersonate → no-op
    jar.set(ACTIVE_MANAGER_COOKIE, userId, {
      path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    });
  } else {
    jar.delete(ACTIVE_MANAGER_COOKIE);
  }
  revalidatePath('/', 'layout');
}
