export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { TeamManagement } from '@/components/team/team-management';

export const metadata = { title: 'Team — Tempo' };

export default async function TeamPage() {
  // Owner/admin only, and impersonation-aware via getWorkspaceScope — a viewed-as
  // manager is bounced. Managing members is an owner/admin capability.
  const scope = await getWorkspaceScope();
  if (!scope) redirect('/dashboard');
  if (scope.role !== 'owner' && scope.role !== 'admin') redirect('/dashboard');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: brands } = await supabase
    .from('brands_v2')
    .select('id, name, slug, display_name, color')
    .order('name');

  const { data: members } = await supabase
    .from('user_profiles')
    .select('user_id, email, name, role, status, can_view_finance')
    .eq('tenant_id', scope.tenantId)
    .neq('role', 'creator')
    .order('role');

  const { data: accessRows } = await supabase
    .from('user_brand_access')
    .select('user_id, brand_id')
    .eq('tenant_id', scope.tenantId);

  // Real invite status: a member who has never signed in is still "pending".
  // status on user_profiles is stamped 'active' at invite time, so it can't tell.
  const admin = await createAdminClient();
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 200 });
  const signedIn = new Set(
    (authList?.users ?? []).filter((u) => u.last_sign_in_at).map((u) => u.id),
  );

  const users = (members ?? []).map((m) => ({
    ...m,
    brand_access: (accessRows ?? []).filter((a) => a.user_id === m.user_id).map((a) => a.brand_id),
    pending: !signedIn.has(m.user_id),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--foreground)]">Team</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Invite teammates and manage their roles, brand access, and finance visibility.
        </p>
      </div>
      <TeamManagement
        users={users}
        brands={brands ?? []}
        tenantId={scope.tenantId}
        currentUserId={user?.id ?? ''}
      />
    </div>
  );
}
