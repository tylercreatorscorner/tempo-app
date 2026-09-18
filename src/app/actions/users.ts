'use server';

import { createServerClient } from '@supabase/ssr';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { assertNotImpersonating } from '@/lib/auth/platform-admin';
import { revalidatePath } from 'next/cache';
import { inviteWorkspaceMember } from '@/lib/auth/invite-workspace-member';

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
  const { data: profile, error } = await supabase
    .from('user_profiles').select('role, tenant_id').eq('user_id', user.id).maybeSingle();
  if (error || !profile?.tenant_id || !['owner', 'admin'].includes(profile.role)) throw new Error('Unauthorized');
  return { supabase, admin: await createAdminClient(), tenantId: profile.tenant_id as string, userId: user.id };
}

async function editableMember(context: Awaited<ReturnType<typeof assertOwnerOrAdmin>>, userId: string) {
  if (typeof userId !== 'string' || !userId || userId === context.userId) throw new Error('Cannot edit your own team access.');
  const { data: target, error } = await context.admin.from('user_profiles')
    .select('user_id, role').eq('user_id', userId).eq('tenant_id', context.tenantId).maybeSingle();
  if (error || !target || target.role === 'owner') throw new Error('Member cannot be edited.');
  return target;
}

export async function inviteUser(email: string, role: string, canViewFinance = true) {
  const result = await inviteWorkspaceMember({email,role,canViewFinance});
  revalidatePath('/settings');
  revalidatePath('/team');
  return {userId:result.userId};
}

/** Return expected failures as data: production server actions redact thrown errors. */
export async function submitTeamInvitation(email: string, role: string, canViewFinance: boolean) {
  try {
    return { ok: true as const, ...await inviteUser(email, role, canViewFinance) };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const safeMessages = new Set([
      'Invalid email.', 'Unsupported team role.', 'Invalid finance access.',
      'Could not look up account. Retry invitation.',
      'Could not invite account. Reload and retry invitation.',
      'Cannot invite your own account.', 'Could not check account ownership.',
      'Account cannot be invited to this team.',
      'Could not save invitation. Reload and try again.',
      'Access saved, but the sign-in email failed. Retry or resend from Team.',
    ]);
    return { ok: false as const, error: safeMessages.has(message) ? message : 'Invitation could not be completed. Refresh the page and try again.' };
  }
}
export async function updateUserRole(userId: string, role: string) {
  const context = await assertOwnerOrAdmin();
  if (!['admin', 'manager', 'coach', 'brand'].includes(role)) throw new Error('Unsupported team role.');
  const target = await editableMember(context, userId);
  const { admin, tenantId } = context;
  // Moving someone to coach also clears the finance flag: getWorkspaceScope
  // hardcodes coach finance to false anyway, but the column must not linger true
  // (defense for any reader that consults the column directly).
  // A stale explicit role_id would retain the old permission matrix. Null uses
  // the existing tenant-and-role-key fallback in getWorkspaceScope.
  const patch = role === 'coach' ? { role, role_id: null, can_view_finance: false } : { role, role_id: null };
  const { data, error } = await admin.from('user_profiles').update(patch)
    .eq('user_id', userId).eq('tenant_id', tenantId).eq('role', target.role).select('user_id').maybeSingle();
  if (error || !data) throw new Error('Member update failed. Reload and try again.');
  revalidatePath('/settings');
  revalidatePath('/team');
}

/** Toggle a member's Finance access (owner/admin/viewer always see it regardless;
 *  coaches are a hard no — this action refuses to grant them finance). */
export async function updateFinanceAccess(userId: string, canViewFinance: boolean) {
  const context = await assertOwnerOrAdmin();
  if (typeof canViewFinance !== 'boolean') throw new Error('Invalid finance access.');
  const target = await editableMember(context, userId);
  if (canViewFinance && target.role === 'coach') throw new Error('Coaches can never see Finance.');
  const { data, error } = await context.admin.from('user_profiles').update({ can_view_finance: canViewFinance })
    .eq('user_id', userId).eq('tenant_id', context.tenantId).eq('role', target.role).select('user_id').maybeSingle();
  if (error || !data) throw new Error('Member update failed. Reload and try again.');
  revalidatePath('/settings');
  revalidatePath('/team');
}

export async function removeUser(userId: string) {
  const context = await assertOwnerOrAdmin();
  const target = await editableMember(context, userId);
  const { data, error } = await context.admin.from('user_profiles').delete()
    .eq('user_id', userId).eq('tenant_id', context.tenantId).eq('role', target.role).select('user_id').maybeSingle();
  if (error || !data) throw new Error('Member removal failed. Reload and try again.');
  revalidatePath('/settings');
  revalidatePath('/team');
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
  revalidatePath('/team');
  return { ok: true, email: target.email };
}

export async function updateBrandAccess(userId: string, brandIds: string[], tenantId: string) {
  const context = await assertOwnerOrAdmin();
  await editableMember(context, userId);
  if (tenantId !== context.tenantId || !Array.isArray(brandIds) || brandIds.some(id => typeof id !== 'string' || !id)) {
    throw new Error('Invalid brand access.');
  }
  const ids = [...new Set(brandIds)];
  const { admin } = context;
  if (ids.length) {
    const { data, error, count } = await admin.from('brands_v2').select('id', { count: 'exact' })
      .eq('tenant_id', context.tenantId).in('id', ids);
    if (error || !data || count !== ids.length || data.length !== ids.length) throw new Error('Brand is not in your tenant.');
  }
  // Recheck and lock membership inside the transaction; a failed insert leaves
  // the previous assignment intact instead of deleting access first.
  const { error } = await admin.rpc('replace_member_brand_access', {
    p_actor_id: context.userId, p_user_id: userId, p_brand_ids: ids,
  });
  if (error) throw new Error('Could not save brand access. Reload and try again.');
  revalidatePath('/settings');
  revalidatePath('/team');
}

