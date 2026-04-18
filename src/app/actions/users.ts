'use server';

import { createAdminClient, createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

async function assertOwnerOrAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');
  const { data: profile } = await supabase
    .from('user_profiles').select('role, tenant_id').eq('user_id', user.id).maybeSingle();
  if (!profile || !['owner', 'admin'].includes(profile.role)) throw new Error('Unauthorized');
  return { supabase, admin: await createAdminClient(), tenantId: profile.tenant_id as string };
}

export async function inviteUser(email: string, role: string) {
  const { admin, tenantId } = await assertOwnerOrAdmin();

  // Invite via Supabase auth
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
  });
  if (error) throw new Error(error.message);

  // Create profile
  await admin.from('user_profiles').upsert({
    user_id: data.user.id,
    email,
    role,
    tenant_id: tenantId,
    status: 'active',
  }, { onConflict: 'user_id' });

  revalidatePath('/settings');
}

export async function updateUserRole(userId: string, role: string) {
  const { admin } = await assertOwnerOrAdmin();
  await admin.from('user_profiles').update({ role }).eq('user_id', userId);
  revalidatePath('/settings');
}

export async function removeUser(userId: string) {
  const { admin } = await assertOwnerOrAdmin();
  await admin.from('user_profiles').delete().eq('user_id', userId);
  revalidatePath('/settings');
}

export async function updateBrandAccess(userId: string, brandIds: string[], tenantId: string) {
  const { admin } = await assertOwnerOrAdmin();
  // Replace all brand access for this user
  await admin.from('user_brand_access').delete().eq('user_id', userId);
  if (brandIds.length > 0) {
    await admin.from('user_brand_access').insert(
      brandIds.map(brand_id => ({ user_id: userId, brand_id, tenant_id: tenantId }))
    );
  }
  revalidatePath('/settings');
}
