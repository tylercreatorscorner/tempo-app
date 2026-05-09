/**
 * Automation dispatcher — single entry point that resolves an integration,
 * looks up the action handler, fires it, logs the run, and returns the
 * result. Used by:
 *   - /api/integrations/[id]/test-send  (manual one-off, no automation_id)
 *   - /api/automations/[id]/run         (manual run of a saved automation)
 *   - /api/cron/run-automations         (scheduled runs)
 *
 * One run row per execution. When an automation has multiple steps, all
 * step results land in the same run's step_results array.
 */
import { createAdminClient } from '@/lib/supabase/server';
import type { ActionResult, IntegrationContext } from '@/lib/integrations/actions/registry';
import { findAction } from '@/lib/integrations/actions/registry';

export interface DispatchStep {
  /** Action identifier — e.g. 'send_message'. */
  action: string;
  params: Record<string, unknown>;
}

export interface DispatchOptions {
  /** Either an integration row id or `legacy:<type>:<brand_id>`. The legacy
   *  form is auto-promoted to a managed row before dispatching, mirroring
   *  the test-send route's behavior. */
  integrationId: string;
  /** One or more action steps to fire in order. */
  steps: DispatchStep[];
  /** When set, the run row is linked to this automation. Null for one-off
   *  test sends. */
  automationId?: string | null;
  /** Provenance string for the run row. */
  triggeredBy: string;
}

export interface DispatchResult {
  runId: string | null;
  /** Final aggregate status of the run. */
  status: 'success' | 'failed' | 'partial';
  /** Step-by-step results in the same order as steps. */
  stepResults: Array<ActionResult & { action: string }>;
  /** First step error message, if any. */
  errorMessage: string | null;
  /** Resolved integration id (post-promotion if input was legacy). */
  integrationId: string;
}

export async function dispatch(opts: DispatchOptions): Promise<DispatchResult> {
  const supabase = await createAdminClient();

  // Resolve integration — promote legacy ids on first use.
  const resolved = await resolveIntegration(opts.integrationId);
  if (!resolved.ok) {
    return {
      runId: null,
      status: 'failed',
      stepResults: opts.steps.map(s => ({ action: s.action, ok: false, error: resolved.error })),
      errorMessage: resolved.error ?? 'Integration not found',
      integrationId: opts.integrationId,
    };
  }
  const integration: IntegrationContext = resolved.integration;

  // Open a run row up-front so we have an audit record even if dispatch
  // crashes mid-step.
  const { data: run } = await supabase
    .from('automation_runs')
    .insert({
      automation_id: opts.automationId ?? null,
      integration_id: integration.id,
      status: 'running',
      triggered_by: opts.triggeredBy,
      action: opts.steps[0]?.action ?? null,
    })
    .select('id')
    .single();
  const runId = run?.id ?? null;

  // Execute steps in order. Stop on first failure (no partial-recovery for v1).
  const stepResults: Array<ActionResult & { action: string }> = [];
  let firstError: string | null = null;
  for (const step of opts.steps) {
    const def = findAction(integration.type, step.action);
    if (!def) {
      const r = { action: step.action, ok: false, error: `Unknown action "${step.action}" for type "${integration.type}"` };
      stepResults.push(r);
      firstError = firstError ?? r.error;
      break;
    }
    try {
      const r = await def.handler(integration, step.params);
      stepResults.push({ action: step.action, ...r });
      if (!r.ok) {
        firstError = firstError ?? r.error ?? 'Step failed';
        break;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Step crashed';
      stepResults.push({ action: step.action, ok: false, error: errMsg });
      firstError = firstError ?? errMsg;
      break;
    }
  }

  const completedSteps = stepResults.filter(r => r.ok).length;
  const status: DispatchResult['status'] =
    firstError == null ? 'success'
    : completedSteps === 0 ? 'failed'
    : 'partial';

  // Close the run row + bump integration status
  if (runId) {
    await supabase
      .from('automation_runs')
      .update({
        status,
        finished_at: new Date().toISOString(),
        step_results: stepResults,
        error_message: firstError,
      })
      .eq('id', runId);
  }

  await supabase
    .from('integrations')
    .update({
      status: status === 'success' ? 'connected' : 'error',
      last_used_at: new Date().toISOString(),
      ...(status === 'success'
        ? { last_error_at: null, last_error_message: null }
        : { last_error_at: new Date().toISOString(), last_error_message: firstError }
      ),
    })
    .eq('id', integration.id);

  // Bump the automation counters when this is a saved automation
  if (opts.automationId) {
    await supabase
      .from('automations')
      .update({
        last_run_at: new Date().toISOString(),
        last_run_status: status,
        last_run_message: firstError,
        run_count: await nextRunCount(supabase, opts.automationId),
      })
      .eq('id', opts.automationId);
  }

  return { runId, status, stepResults, errorMessage: firstError, integrationId: integration.id };
}

async function nextRunCount(supabase: Awaited<ReturnType<typeof createAdminClient>>, automationId: string): Promise<number> {
  const { data } = await supabase
    .from('automations')
    .select('run_count')
    .eq('id', automationId)
    .maybeSingle();
  return ((data?.run_count as number | undefined) ?? 0) + 1;
}

// ─── Internals ─────────────────────────────────────────────────────────────

interface ResolveOk {
  ok: true;
  integration: IntegrationContext;
  promoted: boolean;
}
interface ResolveErr {
  ok: false;
  error: string;
}

async function resolveIntegration(id: string): Promise<ResolveOk | ResolveErr> {
  const supabase = await createAdminClient();

  if (id.startsWith('legacy:')) {
    const [, type, brandId] = id.split(':');
    if (type !== 'discord') {
      return { ok: false, error: `legacy ${type} integrations don't support dispatch yet` };
    }
    const { data: brand } = await supabase
      .from('brands_v2')
      .select('id, name, display_name, discord_guild_id, tenant_id')
      .eq('id', brandId)
      .maybeSingle();
    if (!brand) return { ok: false, error: 'Brand not found' };
    if (!brand.discord_guild_id) return { ok: false, error: 'Brand has no Discord guild configured' };

    const { data: created, error: createErr } = await supabase
      .from('integrations')
      .insert({
        tenant_id: brand.tenant_id,
        brand_id: brand.id,
        type: 'discord',
        display_name: `${brand.display_name || brand.name} Server`,
        config: { guild_id: brand.discord_guild_id },
        status: 'connected',
      })
      .select('id, type, config')
      .single();
    if (createErr || !created) {
      return { ok: false, error: createErr?.message ?? 'Failed to promote legacy integration' };
    }
    return {
      ok: true,
      promoted: true,
      integration: { id: created.id, type: created.type, config: (created.config ?? {}) as Record<string, unknown> },
    };
  }

  const { data: row, error: loadErr } = await supabase
    .from('integrations')
    .select('id, type, config')
    .eq('id', id)
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message };
  if (!row) return { ok: false, error: 'Integration not found' };
  return {
    ok: true,
    promoted: false,
    integration: { id: row.id, type: row.type, config: (row.config ?? {}) as Record<string, unknown> },
  };
}
