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
    const [, type, scope] = id.split(':');

    if (type === 'discord') {
      const { data: brand } = await supabase
        .from('brands_v2')
        .select('id, name, display_name, discord_guild_id, tenant_id')
        .eq('id', scope)
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
        .select('id, type, config, credentials')
        .single();
      if (createErr || !created) {
        return { ok: false, error: createErr?.message ?? 'Failed to promote legacy integration' };
      }
      return {
        ok: true,
        promoted: true,
        integration: {
          id: created.id,
          type: created.type,
          config: (created.config ?? {}) as Record<string, unknown>,
          credentials: (created.credentials ?? null) as Record<string, unknown> | null,
        },
      };
    }

    if ((type === 'resend' || type === 'twilio') && scope === 'tenant') {
      // Workspace-wide integration using Tempo's env credentials. Promote on
      // first use so subsequent runs hit the managed row and accumulate
      // last_used_at / last_error_*.
      if (type === 'resend' && !process.env.RESEND_API_KEY) {
        return { ok: false, error: 'RESEND_API_KEY env var is not set' };
      }
      if (type === 'twilio' && (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN)) {
        return { ok: false, error: 'TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN env vars are required' };
      }

      // Pick a tenant — for workspace-scoped legacy ids we don't carry one in
      // the id itself, so we infer from existing rows.
      const { data: anyRow } = await supabase
        .from('integrations')
        .select('tenant_id')
        .not('tenant_id', 'is', null)
        .limit(1)
        .maybeSingle();
      const tenantId = anyRow?.tenant_id ?? null;

      const config: Record<string, unknown> = type === 'resend'
        ? { from_email: process.env.RESEND_FROM_EMAIL ?? null }
        : { from_number: process.env.TWILIO_FROM_NUMBER ?? null };
      const displayName = type === 'resend' ? 'Email (Resend)' : 'SMS (Twilio)';

      const { data: created, error: createErr } = await supabase
        .from('integrations')
        .insert({
          tenant_id: tenantId,
          brand_id: null,
          type,
          display_name: displayName,
          config,
          status: 'connected',
        })
        .select('id, type, config, credentials')
        .single();
      if (createErr || !created) {
        return { ok: false, error: createErr?.message ?? `Failed to promote ${type} integration` };
      }
      return {
        ok: true,
        promoted: true,
        integration: {
          id: created.id,
          type: created.type,
          config: (created.config ?? {}) as Record<string, unknown>,
          credentials: null,
        },
      };
    }

    return { ok: false, error: `legacy ${type} integrations don't support dispatch yet` };
  }

  const { data: row, error: loadErr } = await supabase
    .from('integrations')
    .select('id, type, config, credentials')
    .eq('id', id)
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message };
  if (!row) return { ok: false, error: 'Integration not found' };
  return {
    ok: true,
    promoted: false,
    integration: {
      id: row.id,
      type: row.type,
      config: (row.config ?? {}) as Record<string, unknown>,
      credentials: (row.credentials ?? null) as Record<string, unknown> | null,
    },
  };
}
