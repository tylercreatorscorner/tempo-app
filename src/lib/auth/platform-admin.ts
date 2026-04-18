import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export const ACTIVE_TENANT_COOKIE = 'platform_active_tenant';

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

export async function getAllTenants() {
  const supabase = await createClient();
  const { data } = await supabase.from('tenants').select('id, name, plan').order('name');
  return data ?? [];
}
