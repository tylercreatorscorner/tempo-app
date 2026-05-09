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
import { requireAdmin } from '@/lib/auth/require-admin';
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
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = req.nextUrl;
  const brandId = url.searchParams.get('brand_id');
  const enabledParam = url.searchParams.get('enabled');
  const triggerType = url.searchParams.get('trigger_type');

  const supabase = await createAdminClient();
  let query = supabase
    .from('automations')
    .select('*')
    .order('updated_at', { ascending: false });

  if (brandId && brandId !== 'all') query = query.eq('brand_id', brandId);
  if (enabledParam === 'true') query = query.eq('enabled', true);
  if (enabledParam === 'false') query = query.eq('enabled', false);
  if (triggerType && triggerType !== 'all') query = query.eq('trigger_type', triggerType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ automations: data ?? [] });
}

export async function POST(req: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: PostBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

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
      tenant_id: profile.tenant_id,
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
