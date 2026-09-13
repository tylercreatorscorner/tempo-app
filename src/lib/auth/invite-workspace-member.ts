import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from './require-admin';
import { assertNotImpersonating } from './platform-admin';

/** Shared by team invitations and client onboarding. No tenant comes from input. */
export async function inviteWorkspaceMember(input: {
  email: string; role: string; canViewFinance?: boolean; brandId?: string;
}) {
  await assertNotImpersonating();
  const actor = await requireAdmin();
  if (!actor?.tenant_id) throw new Error('Unauthorized');
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email.');
  if (!['admin','manager','coach','brand'].includes(input.role)) throw new Error('Unsupported team role.');
  const finance = input.canViewFinance ?? true;
  if (typeof finance !== 'boolean') throw new Error('Invalid finance access.');
  if (input.brandId !== undefined && (!input.brandId || input.role !== 'brand')) throw new Error('Invalid brand contact.');
  const admin = await createAdminClient();
  if (input.brandId) {
    const { data, error } = await admin.from('brands_v2').select('id')
      .eq('id',input.brandId).eq('tenant_id',actor.tenant_id).maybeSingle();
    if (error || !data) throw new Error('Brand is not in your tenant.');
  }
  // Increment page ourselves: older Auth SDK pagination metadata truncates
  // multi-digit nextPage values. A full page never implies the account is absent.
  let account: { id: string; email?: string } | null = null;
  const perPage = 1000;
  for (let page=1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({page,perPage});
    if (error) throw new Error('Could not look up account. Retry invitation.');
    account = data.users.find(user => user.email?.toLowerCase() === email) ?? null;
    if (account || data.users.length < perPage) break;
  }
  const existed = !!account;
  if (!account) {
    // Admin creation sends no mail and does not confirm ownership of the email.
    // The recipient verifies ownership through the OTP requested after provisioning.
    const { data, error } = await admin.auth.admin.createUser({email,email_confirm:false});
    if (error || !data.user) throw new Error('Could not create account. Retry invitation.');
    account = data.user;
  }
  if (account.id === actor.user_id) throw new Error('Cannot invite your own account.');
  const { data: target, error: targetError } = await admin.from('user_profiles')
    .select('tenant_id,role').eq('user_id',account.id).maybeSingle();
  if (targetError) throw new Error('Could not check account ownership.');
  if (target && (target.tenant_id !== actor.tenant_id || !target.role || target.role === 'owner'
    || (input.brandId && !['brand','brand_contact'].includes(target.role)))) {
    throw new Error('Account cannot be invited to this team.');
  }
  const { error: profileError } = await admin.rpc('provision_invited_member', {
    p_actor_id:actor.user_id,p_user_id:account.id,p_email:email,p_role:input.role,
    p_finance:input.role === 'coach' ? false : finance,p_brand_id:input.brandId ?? null,
  });
  if (profileError) throw new Error('Could not save invitation. Reload and try again.');
  const anon = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
    cookies:{getAll(){return [];},setAll(){}},
  });
  const { error: mailError } = await anon.auth.signInWithOtp({email,options:{shouldCreateUser:false,
    emailRedirectTo:`${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`}});
  if (mailError) throw new Error('Access saved, but the sign-in email failed. Retry or resend from Team.');
  return {userId:account.id,existed};
}
