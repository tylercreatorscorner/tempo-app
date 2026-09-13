/**
 * Roles and their permission matrix.
 *
 * GET  /api/roles          — every role in the tenant with its grants + headcount
 * POST /api/roles          — duplicate a role (the only way to create one)
 * PATCH /api/roles?id=…    — rename, or set the whole permission matrix
 * DELETE /api/roles?id=…   — remove a custom role nobody holds
 *
 * ⚠️ Editing roles is `team` + `configure`, which only owner/admin hold in the
 * seed. Anyone who can edit roles can grant themselves anything, so this is the
 * one screen where read and configure are genuinely different powers.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { guardScreen } from '@/lib/auth/require-screen';
import { SCREENS, type Level } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

const LEVELS: Level[] = ['read', 'write', 'configure'];
const SCREEN_SET = new Set<string>(SCREENS);

// Configurable capabilities may narrow role administration, never grant it to
// non-administrators. View-as sessions remain read-only at this boundary too.
async function guardRoleMutation() {
  const scope = await guardScreen('team', 'configure');
  if (scope instanceof NextResponse) return scope;
  if (!scope.tenantId || scope.impersonating || !['owner', 'admin'].includes(scope.role)) {
    return NextResponse.json({ error: 'Only workspace owners and admins can manage roles.' }, { status: 403 });
  }
  return scope;
}

export async function GET() {
  const scope = await guardScreen('team', 'read');
  if (scope instanceof NextResponse) return scope;
  if (!scope.tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = await createAdminClient();
  const { data: roles, error: rErr } = await supabase.from('roles')
    .select('id, key, name, description, is_default')
    .eq('tenant_id', scope.tenantId).order('is_default', { ascending: false }).order('name');
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
  const roleIds = (roles ?? []).map(role => role.id);
  if (!roleIds.length) return NextResponse.json({ roles: [] });
  const [{ data: perms, error: pErr }, { data: people, error: uErr }] = await Promise.all([
    supabase.from('role_permissions').select('role_id, screen, level').in('role_id', roleIds),
    supabase.from('user_profiles').select('role_id').eq('tenant_id', scope.tenantId).neq('role', 'creator'),
  ]);
  if (pErr || uErr) return NextResponse.json({ error: 'Could not load role access.' }, { status: 500 });

  const ids = new Set((roles ?? []).map((r) => r.id as string));
  const byRole = new Map<string, string[]>();
  for (const p of perms ?? []) {
    const id = p.role_id as string;
    // Defense in depth after the query's tenant-owned role-ID filter.
    if (!ids.has(id)) continue;
    if (!byRole.has(id)) byRole.set(id, []);
    byRole.get(id)!.push(`${p.screen}:${p.level}`);
  }
  const counts = new Map<string, number>();
  for (const u of people ?? []) {
    const id = u.role_id as string | null;
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return NextResponse.json({
    roles: (roles ?? []).map((r) => ({
      id: r.id, key: r.key, name: r.name, description: r.description,
      isDefault: r.is_default,
      members: counts.get(r.id as string) ?? 0,
      permissions: byRole.get(r.id as string) ?? [],
    })),
  });
}

/** One database transaction owns each role lifecycle mutation. */
async function mutateRole(req: NextRequest, operation: 'clone' | 'replace' | 'delete') {
  const scope = await guardRoleMutation();
  if (scope instanceof NextResponse) return scope;
  const body: unknown = operation === 'delete' ? {} : await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid role payload.' }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const id = operation === 'clone' ? input.from : req.nextUrl.searchParams.get('id');
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid role id.' }, { status: 400 });
  }
  if ((operation === 'clone' || 'name' in input) &&
      (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 60)) {
    return NextResponse.json({ error: 'Role name must contain 1 to 60 characters.' }, { status: 400 });
  }
  if ('permissions' in input && (!Array.isArray(input.permissions) || input.permissions.some(raw => {
    if (typeof raw !== 'string') return true;
    const parts = raw.split(':');
    return parts.length !== 2 || !SCREEN_SET.has(parts[0]) || !LEVELS.includes(parts[1] as Level);
  }))) {
    return NextResponse.json({ error: 'Invalid permission matrix.' }, { status: 400 });
  }
  if (operation === 'replace' && !('name' in input) && !('permissions' in input)) {
    return NextResponse.json({ error: 'Send a name or permission matrix.' }, { status: 400 });
  }
  const supabase = await createAdminClient();
  const { data, error } = await supabase.rpc('manage_workspace_role', {
    p_actor_id: scope.userId, p_operation: operation, p_role_id: id,
    p_name: typeof input.name === 'string' ? input.name.trim() : null,
    p_permissions: Array.isArray(input.permissions) ? [...new Set(input.permissions)] : null,
  });
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404
      : error.code === '23514' ? 409 : error.code === '22023' ? 400 : 500;
    return NextResponse.json({ error: status === 500 ? 'Could not save role access. Please retry.' : error.message }, { status });
  }
  return NextResponse.json({ ok: true, ...(operation === 'clone' ? { id: data } : {}) });
}

export const POST = (req: NextRequest) => mutateRole(req, 'clone');
export const PATCH = (req: NextRequest) => mutateRole(req, 'replace');
export const DELETE = (req: NextRequest) => mutateRole(req, 'delete');
