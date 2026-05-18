/**
 * /api/automations
 *
 * GET   — list automations (with filters: brand, enabled, trigger_type)
 * POST  — create a new automation
 *
 * Each automation owns one or more `steps` (an array of action descriptors).
 * Steps are stored as jsonb so the schema doesn't have to change every time
 * we add a new action type — the registry validates on dispatch.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

interface PostBody {
  name?: string;
  description?: string | null;
  brand_id?: string | null;
  trigger_type?: 'cron' | 'event' | 'manual';
  trigger_config?: Record<string, unknown>;
  steps?: Array<{
    integration_id: string;
    action: string;
    params: Record<string, unknown>;
  }>;
  enabled?: boolean;
}

const VALID_TRIGGERS = new Set(['cron', 'event', 'manual']);

export async function GET(req: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const scopedBrandIds = scope.brandScope.kind === 'scoped' ? scope.brandScope.brandIds : null;

  const url = req.nextUrl;
  const brandId = url.searchParams.get('brand_id');
  const enabledParam = url.searchParams.get('enabled');
  const triggerType = url.searchParams.get('trigger_type');

  // Scoped (manager) requesting a brand outside their access → nothing.
  if (scopedBrandIds && brandId && brandId !== 'all' && !scopedBrandIds.includes(brandId)) {
    return NextResponse.json({ error: 'Forbidden: brand not in your access' }, { status: 403 });
  }

  const supabase = await createAdminClient();
  let query = supabase
    .from('automations')
    .select('*')
    .order('updated_at', { ascending: false });

  if (brandId && brandId !== 'all') query = query.eq('brand_id', brandId);
  // Managers only ever see their brands' automations (never global/null).
  else if (scopedBrandIds) query = query.in('brand_id', scopedBrandIds.length ? scopedBrandIds : ['00000000-0000-0000-0000-000000000000']);
  if (enabledParam === 'true') query = query.eq('enabled', true);
  if (enabledParam === 'false') query = query.eq('enabled', false);
  if (triggerType && triggerType !== 'all') query = query.eq('trigger_type', triggerType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ automations: data ?? [] });
}

export async function POST(req: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: PostBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Managers may only create automations targeting one of their brands —
  // never a global (brand_id=null) or other-brand automation.
  if (scope.brandScope.kind === 'scoped') {
    if (!body.brand_id || !scope.brandScope.brandIds.includes(body.brand_id)) {
      return NextResponse.json(
        { error: 'Managers must target one of their own brands (no global automations)' },
        { status: 403 },
      );
    }
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (!body.trigger_type || !VALID_TRIGGERS.has(body.trigger_type)) {
    return NextResponse.json({ error: 'trigger_type must be one of cron|event|manual' }, { status: 400 });
  }
  if (!Array.isArray(body.steps) || body.steps.length === 0) {
    return NextResponse.json({ error: 'at least one step is required' }, { status: 400 });
  }
  for (const [i, s] of body.steps.entries()) {
    if (!s.integration_id || !s.action) {
      return NextResponse.json({ error: `step ${i + 1} missing integration_id or action` }, { status: 400 });
    }
  }

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('automations')
    .insert({
      tenant_id: scope.tenantId,
      brand_id: body.brand_id ?? null,
      name: body.name.trim(),
      description: body.description ?? null,
      trigger_type: body.trigger_type,
      trigger_config: body.trigger_config ?? {},
      steps: body.steps,
      enabled: body.enabled ?? true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ automation: data }, { status: 201 });
}
