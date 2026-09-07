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
import { SCREENS, type Screen, type Level } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

const LEVELS: Level[] = ['read', 'write', 'configure'];
const SCREEN_SET = new Set<string>(SCREENS);

export async function GET() {
  const scope = await guardScreen('team', 'read');
  if (scope instanceof NextResponse) return scope;

  const supabase = await createAdminClient();
  const [{ data: roles, error: rErr }, { data: perms }, { data: people }] = await Promise.all([
    supabase.from('roles').select('id, key, name, description, is_default')
      .eq('tenant_id', scope.tenantId).order('is_default', { ascending: false }).order('name'),
    supabase.from('role_permissions').select('role_id, screen, level'),
    supabase.from('user_profiles').select('role_id').eq('tenant_id', scope.tenantId).neq('role', 'creator'),
  ]);
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  const ids = new Set((roles ?? []).map((r) => r.id as string));
  const byRole = new Map<string, string[]>();
  for (const p of perms ?? []) {
    const id = p.role_id as string;
    // Permissions for another tenant's roles are filtered here rather than in
    // the query: role_permissions has no tenant column of its own.
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

/** Duplicate an existing role. There is no blank-role path on purpose: a role
 *  starting from nothing is a role someone forgets to finish. */
export async function POST(req: NextRequest) {
  const scope = await guardScreen('team', 'configure');
  if (scope instanceof NextResponse) return scope;

  const body = await req.json().catch(() => ({}));
  const fromId = typeof body.from === 'string' ? body.from : null;
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
  if (!fromId || !name) {
    return NextResponse.json({ error: 'Send `from` (role id) and `name`.' }, { status: 400 });
  }

  const supabase = await createAdminClient();
  const { data: src } = await supabase.from('roles')
    .select('id, description').eq('id', fromId).eq('tenant_id', scope.tenantId).maybeSingle();
  if (!src) return NextResponse.json({ error: 'Role not found' }, { status: 404 });

  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
    || `role_${Date.now()}`;

  const { data: created, error } = await supabase.from('roles')
    .insert({ tenant_id: scope.tenantId, key, name, description: src.description, is_default: false })
    .select('id').single();
  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? 'Could not create role' }, { status: 500 });
  }

  const { data: srcPerms } = await supabase.from('role_permissions')
    .select('screen, level').eq('role_id', fromId);
  if (srcPerms?.length) {
    await supabase.from('role_permissions').insert(
      srcPerms.map((p) => ({ role_id: created.id, screen: p.screen, level: p.level })),
    );
  }
  return NextResponse.json({ ok: true, id: created.id });
}

export async function PATCH(req: NextRequest) {
  const scope = await guardScreen('team', 'configure');
  if (scope instanceof NextResponse) return scope;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing role id' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const supabase = await createAdminClient();

  const { data: role } = await supabase.from('roles')
    .select('id, is_default').eq('id', id).eq('tenant_id', scope.tenantId).maybeSingle();
  if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 });
  // 🚨 A default is the thing every other role was copied FROM. Editing one in
  // place silently rewrites what 'Manager' means for everyone who holds it.
  if (role.is_default) {
    return NextResponse.json(
      { error: 'Default roles are read-only. Duplicate it to make an editable copy.' },
      { status: 409 },
    );
  }

  if (typeof body.name === 'string' && body.name.trim()) {
    await supabase.from('roles').update({ name: body.name.trim().slice(0, 60) }).eq('id', id);
  }

  if (Array.isArray(body.permissions)) {
    /**
     * ⚠️ VALIDATED AGAINST THE SCREEN LIST, not accepted as sent. An unknown
     * screen would sit in the table forever, invisible in a UI that only draws
     * known screens, and can() would never grant it — a permission nobody can
     * see and nothing honours.
     */
    const rows: { role_id: string; screen: string; level: string }[] = [];
    for (const raw of body.permissions as unknown[]) {
      if (typeof raw !== 'string') continue;
      const [screen, level] = raw.split(':');
      if (!SCREEN_SET.has(screen)) continue;
      if (!LEVELS.includes(level as Level)) continue;
      rows.push({ role_id: id, screen, level });
    }
    // Replace wholesale: the client sends the full matrix, so a diff would only
    // add a way for the two to drift.
    const { error: delErr } = await supabase.from('role_permissions').delete().eq('role_id', id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    if (rows.length) {
      const { error: insErr } = await supabase.from('role_permissions').insert(rows);
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const scope = await guardScreen('team', 'configure');
  if (scope instanceof NextResponse) return scope;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing role id' }, { status: 400 });

  const supabase = await createAdminClient();
  const { data: role } = await supabase.from('roles')
    .select('id, is_default').eq('id', id).eq('tenant_id', scope.tenantId).maybeSingle();
  if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 });
  if (role.is_default) {
    return NextResponse.json({ error: 'Default roles cannot be deleted.' }, { status: 409 });
  }

  // ⚠️ Refuse rather than orphan. Clearing role_id on delete would drop those
  // people to no permissions at all, which reads as a bug rather than a choice.
  const { count } = await supabase.from('user_profiles')
    .select('user_id', { count: 'exact', head: true }).eq('role_id', id);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `${count} member${count === 1 ? '' : 's'} still hold this role. Move them first.` },
      { status: 409 },
    );
  }

  const { error } = await supabase.from('roles').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
