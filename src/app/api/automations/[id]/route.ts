/**
 * /api/automations/[id]
 *
 * GET    — fetch a single automation + recent runs
 * PATCH  — partial update (name / description / enabled / steps / trigger_config)
 * DELETE — hard delete (cascades to automation_runs via FK)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope, type WorkspaceScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const ALLOWED = ['name', 'description', 'brand_id', 'trigger_type', 'trigger_config', 'steps', 'enabled'] as const;
const VALID_TRIGGERS = new Set(['cron', 'event', 'manual']);

/**
 * Confirms the caller may act on this automation. Managers are limited to
 * automations whose brand_id is in their access (never global/null).
 * Returns the automation's brand_id on success, or a NextResponse on failure.
 */
async function authorizeAutomation(
  scope: WorkspaceScope,
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  id: string,
): Promise<{ brand_id: string | null } | NextResponse> {
  const { data: row } = await supabase
    .from('automations').select('brand_id').eq('id', id).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (
    scope.brandScope.kind === 'scoped' &&
    !(row.brand_id && scope.brandScope.brandIds.includes(row.brand_id))
  ) {
    return NextResponse.json({ error: 'Forbidden: not in your access' }, { status: 403 });
  }
  return { brand_id: row.brand_id };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const supabase = await createAdminClient();

  const denied = await authorizeAutomation(scope, supabase, id);
  if (denied instanceof NextResponse) return denied;

  const [{ data: automation, error: aErr }, { data: runs }] = await Promise.all([
    supabase.from('automations').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('automation_runs')
      .select('id, started_at, finished_at, status, triggered_by, action, step_results, error_message')
      .eq('automation_id', id)
      .order('started_at', { ascending: false })
      .limit(50),
  ]);

  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
  if (!automation) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ automation, runs: runs ?? [] });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const updates: Record<string, unknown> = {};
  for (const k of ALLOWED) {
    if (k in body) updates[k] = body[k];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  // Validate trigger_type if it's being changed — the DB has a CHECK constraint
  // but we want a friendly 400 instead of a Postgres error.
  if ('trigger_type' in updates) {
    const tt = updates.trigger_type;
    if (typeof tt !== 'string' || !VALID_TRIGGERS.has(tt)) {
      return NextResponse.json({ error: 'trigger_type must be one of cron|event|manual' }, { status: 400 });
    }
  }

  updates.updated_at = new Date().toISOString();

  const supabase = await createAdminClient();

  const denied = await authorizeAutomation(scope, supabase, id);
  if (denied instanceof NextResponse) return denied;
  // A manager may not reassign an automation to a brand outside their access
  // (or to global/null).
  if (
    scope.brandScope.kind === 'scoped' &&
    'brand_id' in updates &&
    !(typeof updates.brand_id === 'string' && scope.brandScope.brandIds.includes(updates.brand_id))
  ) {
    return NextResponse.json(
      { error: 'Forbidden: target brand not in your access' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('automations')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ automation: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const supabase = await createAdminClient();

  const denied = await authorizeAutomation(scope, supabase, id);
  if (denied instanceof NextResponse) return denied;

  const { error } = await supabase.from('automations').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
