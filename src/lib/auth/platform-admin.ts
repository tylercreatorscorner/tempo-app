import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export const ACTIVE_TENANT_COOKIE = 'platform_active_tenant';
// "View as" impersonation: a platform admin previewing a specific member's view.
export const ACTIVE_MANAGER_COOKIE = 'platform_active_manager';

export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from('platform_admins').select('user_id').maybeSingle();
  return !!data;
}

export async function getActiveTenantId(): Promise<string | null> {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) return null;
  const jar = await cookies();
  return jar.get(ACTIVE_TENANT_COOKIE)?.value ?? null;
}

/**
 * The user_id the platform admin is "viewing as", or null. Cookie-first so a
 * normal (non-impersonating) request pays nothing; only verifies platform-admin
 * status when the cookie is actually set (rare). Returns null for non-admins so
 * the cookie can never be used to escalate.
 */
export async function getActiveManagerId(): Promise<string | null> {
  const jar = await cookies();
  const val = jar.get(ACTIVE_MANAGER_COOKIE)?.value;
  if (!val) return null;
  if (!(await isPlatformAdmin())) return null;
  return val;
}

export async function getAllTenants() {
  const supabase = await createClient();
  const { data } = await supabase.from('tenants').select('id, name, plan').order('name');
  return data ?? [];
}
