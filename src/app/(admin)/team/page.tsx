export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { TeamManagement } from '@/components/team/team-management';
import { PageHeader } from '@/components/ui/page-header';

export const metadata = { title: 'Team — Tempo' };

export default async function TeamPage() {
  // Owner/admin only, and impersonation-aware via getWorkspaceScope — a viewed-as
  // manager is bounced. Managing members is an owner/admin capability.
  const scope = await getWorkspaceScope();
  if (!scope) redirect('/dashboard');
  if (scope.role !== 'owner' && scope.role !== 'admin') redirect('/dashboard');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  /**
   * ⚠️ is_archived travels with the brand so the access picker can hide
   * archived brands from NEW grants while still showing one a user already
   * holds. Offering an archived brand invites granting access to something
   * nobody can reach; hiding an existing grant would make a live permission
   * invisible, which is worse.
   */
  const { data: brands } = await supabase
    .from('brands_v2')
    .select('id, name, slug, display_name, color, is_archived')
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

  /**
   * Real invite status: a member who has never signed in is still "pending".
   * status on user_profiles is stamped 'active' at invite time, so it can't tell.
   *
   * 🚨 THIS READ WAS TRUNCATED AND IT ACCUSED PEOPLE OF NOT SHOWING UP.
   * listUsers({ perPage: 200 }) returns ONE page, and the tenant has 262 auth
   * users (22 staff plus 191 creators plus brand contacts). Everyone past the
   * first page was absent from this set and therefore rendered "pending" no
   * matter how often they had signed in — the page reported 7 unaccepted
   * invites when the true number was 1, and one of the six false positives was
   * the OWNER, reading the page while signed in as that account.
   *
   * ⚠⚠ A LARGER perPage IS NOT THE FIX, it is the same bug with more headroom.
   * Page until a short page comes back. The cap is there so a runaway cannot
   * hang the request; if it is ever hit the count is understated rather than
   * wrong in a way that blames someone, and staff ids are created before
   * creators so they land on the early pages.
   */
  const admin = await createAdminClient();
  const signedIn = new Set<string>();
  const PER_PAGE = 1000;
  for (let page = 1; page <= 10; page++) {
    const { data: authList, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) {
      console.error('[team] listUsers page', page, 'failed:', error.message);
      break;
    }
    const batch = authList?.users ?? [];
    for (const u of batch) if (u.last_sign_in_at) signedIn.add(u.id);
    if (batch.length < PER_PAGE) break;
  }

  const users = (members ?? []).map((m) => ({
    ...m,
    brand_access: (accessRows ?? []).filter((a) => a.user_id === m.user_id).map((a) => a.brand_id),
    pending: !signedIn.has(m.user_id),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Access"
        title="Team"
        subtitle="Who can sign in, what they can reach, and who can see money."
      />
      <TeamManagement
        users={users}
        brands={brands ?? []}
        tenantId={scope.tenantId}
        currentUserId={user?.id ?? ''}
      />
    </div>
  );
}
