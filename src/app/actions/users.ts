'use server';

import { createServerClient } from '@supabase/ssr';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { assertNotImpersonating } from '@/lib/auth/platform-admin';
import { revalidatePath } from 'next/cache';

/**
 * Fresh anon-key Supabase client with no session attached. Used to trigger
 * outbound auth emails (signInWithOtp) without touching the caller's cookies.
 */
function createAnonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: { getAll() { return []; }, setAll() {} },
    }
  );
}

async function assertOwnerOrAdmin() {
  // Block all team-management mutations while a platform admin is "viewing as"
  // a member (server actions bypass the /api/* read-only middleware gate).
  await assertNotImpersonating();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');
  const { data: profile } = await supabase
    .from('user_profiles').select('role, tenant_id').eq('user_id', user.id).maybeSingle();
  if (!profile || !['owner', 'admin'].includes(profile.role)) throw new Error('Unauthorized');
  return { supabase, admin: await createAdminClient(), tenantId: profile.tenant_id as string };
}

export async function inviteUser(email: string, role: string, canViewFinance = true) {
  const { admin, tenantId } = await assertOwnerOrAdmin();

  // Try to invite a brand-new user first
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
  });

  let userId: string | null = null;

  if (error) {
    const alreadyRegistered = /already.*registered|already.*exists/i.test(error.message);
    if (!alreadyRegistered) throw new Error(error.message);

    // User exists in auth.users — look them up and trigger a magic-link email.
    // generateLink() only returns the URL; signInWithOtp() actually sends the email.
    const { data: list } = await admin.auth.admin.listUsers();
    const existing = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!existing) throw new Error('User exists but could not be located.');
    userId = existing.id;

    const anon = createAnonClient();
    const { error: otpError } = await anon.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    });
    if (otpError) throw new Error(`Found existing account but failed to send magic link: ${otpError.message}`);
  } else {
    userId = data.user.id;
  }

  if (!userId) throw new Error('Could not resolve user id.');

  // Upsert profile (creates it for brand-new users, updates role/tenant for existing ones)
  const { error: upsertError } = await admin.from('user_profiles').upsert({
    user_id: userId,
    email,
    role,
    tenant_id: tenantId,
    status: 'active',
    can_view_finance: canViewFinance,
  }, { onConflict: 'user_id' });
  if (upsertError) throw new Error(`Profile upsert failed: ${upsertError.message}`);

  revalidatePath('/settings');
  return { userId };
}

export async function updateUserRole(userId: string, role: string) {
  const { admin } = await assertOwnerOrAdmin();
  await admin.from('user_profiles').update({ role }).eq('user_id', userId);
  revalidatePath('/settings');
}

/** Toggle a member's Finance access (owner/admin/viewer always see it regardless). */
export async function updateFinanceAccess(userId: string, canViewFinance: boolean) {
  const { admin } = await assertOwnerOrAdmin();
  await admin.from('user_profiles').update({ can_view_finance: canViewFinance }).eq('user_id', userId);
  revalidatePath('/settings');
}

export async function removeUser(userId: string) {
  const { admin } = await assertOwnerOrAdmin();
  await admin.from('user_profiles').delete().eq('user_id', userId);
  revalidatePath('/settings');
}

/**
 * Sends a fresh magic-link / OTP code email to an existing team member.
 * Useful when a client lost the email, hit an expired code, or had their
 * link consumed by an email scanner. Tenant-scoped (can't resend to users
 * in other tenants) and gated to owner/admin.
 */
export async function resendMagicLink(userId: string) {
  const { admin, tenantId } = await assertOwnerOrAdmin();

  const { data: target } = await admin
    .from('user_profiles')
    .select('email, tenant_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!target) throw new Error('User not found.');
  if (target.tenant_id !== tenantId) throw new Error('User is not in your tenant.');
  if (!target.email) throw new Error('User has no email on file.');

  const anon = createAnonClient();
  const { error } = await anon.auth.signInWithOtp({
    email: target.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });
  if (error) throw new Error(`Failed to send: ${error.message}`);

  revalidatePath('/settings');
  return { ok: true, email: target.email };
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
