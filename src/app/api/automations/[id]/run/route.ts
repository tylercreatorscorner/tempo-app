/**
 * POST /api/automations/[id]/run
 *
 * Manually fires an automation's steps right now (regardless of trigger_type).
 * Useful for:
 *   - Testing a new automation before enabling its cron schedule
 *   - Re-running a failed automation after fixing the upstream issue
 *   - Manual-trigger automations that have no cron at all
 */
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';
import { dispatch } from '@/lib/automations/dispatch';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const supabase = await createAdminClient();

  const { data: automation, error } = await supabase
    .from('automations')
    .select('id, steps, brand_id')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!automation) return NextResponse.json({ error: 'Automation not found' }, { status: 404 });

  // A manager may only run automations for brands in their access
  // (never a global/null or other-brand automation).
  if (
    scope.brandScope.kind === 'scoped' &&
    !(automation.brand_id && scope.brandScope.brandIds.includes(automation.brand_id))
  ) {
    return NextResponse.json({ error: 'Forbidden: not in your access' }, { status: 403 });
  }

  const steps = automation.steps as Array<{ integration_id: string; action: string; params: Record<string, unknown> }>;
  if (!Array.isArray(steps) || steps.length === 0) {
    return NextResponse.json({ error: 'Automation has no steps configured' }, { status: 400 });
  }

  // For v1, every step targets the same integration (the dispatcher reads
  // ONE integration per call). When/if we support multi-integration steps,
  // dispatch() iterates per-step. For now: assert single integration_id.
  const integrationId = steps[0].integration_id;
  if (steps.some(s => s.integration_id !== integrationId)) {
    return NextResponse.json({ error: 'Multi-integration automations not supported yet — split into separate automations' }, { status: 400 });
  }

  const result = await dispatch({
    integrationId,
    automationId: id,
    triggeredBy: `manual:${scope.userId}`,
    steps: steps.map(s => ({ action: s.action, params: s.params })),
  });

  return NextResponse.json({
    ok: result.status === 'success',
    status: result.status,
    run_id: result.runId,
    step_results: result.stepResults,
    error: result.errorMessage,
  });
}
