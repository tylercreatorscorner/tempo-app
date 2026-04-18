'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { ACTIVE_TENANT_COOKIE } from '@/lib/auth/platform-admin';

export async function switchTenant(tenantId: string | null) {
  const jar = await cookies();
  if (tenantId) {
    jar.set(ACTIVE_TENANT_COOKIE, tenantId, { path: '/', httpOnly: true, sameSite: 'lax' });
  } else {
    jar.delete(ACTIVE_TENANT_COOKIE);
  }
  revalidatePath('/', 'layout');
}
