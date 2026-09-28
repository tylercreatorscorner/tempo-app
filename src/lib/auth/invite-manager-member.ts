import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';

/** Brand-limited invitation path. Never changes an existing member's role. */
export async function inviteManagerMember(input: { email: string; role: string; brandIds: string[] }) {
  const scope = await getWorkspaceScope();
  if (!scope || scope.impersonating || scope.role !== 'manager' || scope.brandScope.kind !== 'scoped') {
    throw new Error('Only an assigned manager can send this invitation.');
  }
  const assignedBrandIds = scope.brandScope.brandIds;
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email.');
  if (!['manager', 'coach', 'brand'].includes(input.role)) throw new Error('Unsupported team role.');
  if (!Array.isArray(input.brandIds) || input.brandIds.length === 0 || input.brandIds.length > 32
      || input.brandIds.some(id => typeof id !== 'string' || !id)
      || new Set(input.brandIds).size !== input.brandIds.length
      || input.brandIds.some(id => !assignedBrandIds.includes(id))) {
    throw new Error('Choose only brands assigned to you.');
  }

  const admin = await createAdminClient();
  const { data: brands, error: brandError } = await admin.from('brands_v2')
    .select('id').eq('tenant_id', scope.tenantId).eq('is_archived', false).in('id', input.brandIds);
  if (brandError || brands?.length !== input.brandIds.length) throw new Error('A selected brand is unavailable.');

  let account: { id: string; email?: string } | null = null;
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error('Could not look up account. Retry invitation.');
    account = data.users.find(user => user.email?.toLowerCase() === email) ?? null;
    if (account || data.users.length < perPage) break;
  }
  const existed = !!account;
  if (account) {
    if (account.id === scope.userId) throw new Error('Cannot invite your own account.');
    const { data: target, error } = await admin.from('user_profiles')
      .select('tenant_id,role,status').eq('user_id', account.id).maybeSingle();
    if (error) throw new Error('Could not check account ownership.');
    if (target && (target.tenant_id !== scope.tenantId || target.status !== 'active'
      || (target.role !== input.role && !(input.role === 'brand' && target.role === 'brand_contact')))) {
      throw new Error('Existing member requires an administrator.');
    }
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    });
    if (error || !data.user) throw new Error('Could not invite account. Reload and retry invitation.');
    account = data.user;
  }

  const { error: provisionError } = await admin.rpc('provision_manager_invited_member', {
    p_actor_id: scope.userId,
    p_user_id: account.id,
    p_email: email,
    p_role: input.role,
    p_brand_ids: input.brandIds,
  });
  if (provisionError) throw new Error('Could not save invitation. Check assigned brands and retry.');
  if (existed) {
    const anon = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: { getAll() { return []; }, setAll() {} },
    });
    const { error } = await anon.auth.signInWithOtp({ email, options: {
      shouldCreateUser: false,
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    } });
    if (error) throw new Error('Access saved, but the sign-in email failed.');
  }
  return { userId: account.id, existed };
}
