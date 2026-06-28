'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { ACTIVE_TENANT_COOKIE, ACTIVE_MANAGER_COOKIE } from '@/lib/auth/platform-admin';

export async function switchTenant(tenantId: string | null) {
  const jar = await cookies();
  if (tenantId) {
    jar.set(ACTIVE_TENANT_COOKIE, tenantId, { path: '/', httpOnly: true, sameSite: 'lax' });
  } else {
    jar.delete(ACTIVE_TENANT_COOKIE);
  }
  // Changing tenant invalidates any "view as" (a manager belongs to one tenant) —
  // clear it so we never compose this tenant with another tenant's manager scope.
  jar.delete(ACTIVE_MANAGER_COOKIE);
  revalidatePath('/', 'layout');
}
