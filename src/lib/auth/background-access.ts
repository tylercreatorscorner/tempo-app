import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScopeForUser, isBrandInScope, type WorkspaceScope } from './workspace-scope';

/** Historical broadcasts stored an email. Resolve it only within its workspace. */
export async function resolveJobActor(actor: string | null, tenantId: string | null) {
  if (!actor || !tenantId) return null;
  let userId = actor;
  if (!/^[0-9a-f-]{36}$/i.test(actor)) {
    const admin = await createAdminClient();
    const { data, error } = await admin.from('user_profiles').select('user_id')
      .eq('tenant_id', tenantId).eq('email', actor).maybeSingle();
    if (error || !data) return null;
    userId = data.user_id;
  }
  const scope = await getWorkspaceScopeForUser(userId);
  return scope?.tenantId === tenantId ? scope : null;
}

export async function canReachJobBrand(scope: WorkspaceScope, brandId: unknown): Promise<boolean> {
  if (brandId === null) return scope.brandScope.kind === 'all';
  if (typeof brandId !== 'string' || !isBrandInScope(scope, { id: brandId })) return false;
  const admin = await createAdminClient();
  const { data, error } = await admin.from('brands_v2').select('id')
    .eq('tenant_id', scope.tenantId).eq('id', brandId).maybeSingle();
  return !error && !!data;
}

/** A shared bot credential must never turn a caller-supplied guild into authority. */
export async function canUseDiscordGuild(scope: WorkspaceScope, guildId: unknown, brandId: string | null) {
  if (typeof guildId !== 'string' || !/^\d{15,25}$/.test(guildId)) return false;
  const admin = await createAdminClient();
  const { data, error, count } = await admin.from('brands_v2')
    .select('id, tenant_id', { count:'exact' }).eq('discord_guild_id', guildId);
  if (error || !data?.length || data.length !== count || data.some(row => row.tenant_id !== scope.tenantId)) return false;
  return data.some(row => (!brandId || row.id === brandId) && isBrandInScope(scope, {id:row.id}));
}
