/**
 * GET /api/cron/run-automations
 *
 * Daily cron entrypoint — Vercel hits this once per day. For each enabled
 * automation with trigger_type='cron' that's due to fire today, dispatches
 * its steps. Records every fire as an automation_runs row.
 *
 * Schedule semantics (v1, simple):
 *   trigger_config.frequency: 'daily' (default) | 'weekly' | 'monthly'
 *   trigger_config.day_of_week: 0-6 (Sunday=0) — only used when frequency='weekly'
 *   trigger_config.day_of_month: 1-31 — only used when frequency='monthly'
 *
 * The hour/minute is fixed (whenever Vercel fires the cron). Future: we can
 * add per-automation hour offsets and bucket them.
 *
 * Auth: protected by CRON_SECRET — Vercel cron sends `Authorization: Bearer <secret>`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { dispatch } from '@/lib/automations/dispatch';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface AutomationRow {
  id: string;
  name: string;
  trigger_config: Record<string, unknown> | null;
  steps: Array<{ integration_id: string; action: string; params: Record<string, unknown> }> | null;
}

export async function GET(req: NextRequest) {
  // Auth: only Vercel cron (or someone with the secret) can trigger this.
  const authHeader = req.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createAdminClient();
  const { data: rows, error } = await supabase
    .from('automations')
    .select('id, name, trigger_config, steps')
    .eq('trigger_type', 'cron')
    .eq('enabled', true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const today = new Date(); // server time (UTC on Vercel)
  const dueAutomations: AutomationRow[] = (rows ?? []).filter(r => isDueToday(r.trigger_config, today));

  const results: Array<{ automation_id: string; name: string; status: string; error?: string | null }> = [];
  for (const a of dueAutomations) {
    if (!Array.isArray(a.steps) || a.steps.length === 0) {
      results.push({ automation_id: a.id, name: a.name, status: 'skipped', error: 'no steps' });
      continue;
    }
    const integrationId = a.steps[0].integration_id;
    if (a.steps.some(s => s.integration_id !== integrationId)) {
      results.push({ automation_id: a.id, name: a.name, status: 'skipped', error: 'multi-integration not supported yet' });
      continue;
    }
    const r = await dispatch({
      integrationId,
      automationId: a.id,
      triggeredBy: 'cron',
      steps: a.steps.map(s => ({ action: s.action, params: s.params })),
    });
    results.push({ automation_id: a.id, name: a.name, status: r.status, error: r.errorMessage });
  }

  return NextResponse.json({
    fired_at: new Date().toISOString(),
    eligible: rows?.length ?? 0,
    due_today: dueAutomations.length,
    results,
  });
}

function isDueToday(config: Record<string, unknown> | null, today: Date): boolean {
  if (!config) return true; // empty config → assume daily
  const frequency = (config.frequency as string | undefined) ?? 'daily';
  if (frequency === 'daily') return true;
  if (frequency === 'weekly') {
    const targetDow = config.day_of_week as number | undefined;
    if (targetDow == null) return false;
    return today.getUTCDay() === targetDow;
  }
  if (frequency === 'monthly') {
    const targetDom = config.day_of_month as number | undefined;
    if (targetDom == null) return false;
    return today.getUTCDate() === targetDom;
  }
  return false;
}
