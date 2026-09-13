import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isValidFrequency, nextRunFromLabel } from '@/lib/data/schedule-frequency';
import { detectWebhookKind } from '@/lib/messaging/webhook';

import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { canAccessSchedule } from '@/lib/auth/schedule-access';

// PATCH /api/schedules/[id] — update fields on a schedule (tenant-scoped)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getWorkspaceScope();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const lookup = await createAdminClient();
  const { data: existing, error: lookupError } = await lookup.from('report_schedules')
    .select('*').eq('id', id).eq('tenant_id', profile.tenantId).maybeSingle();
  if (lookupError) return NextResponse.json({ error: 'Schedule lookup failed' }, { status: 500 });
  if (!existing || !await canAccessSchedule(profile, existing, 'write')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const allowed = [
    'report_type', 'source', 'brand', 'period',
    'cron_label', 'destination_kind', 'webhook_url', 'channel_label', 'active', 'format',
  ];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  if (!await canAccessSchedule(profile, { ...existing, ...updates }, 'write')) {
    return NextResponse.json({ error: 'Forbidden: select a permitted specific brand and report type' }, { status: 403 });
  }
  // An authorized edit transfers execution responsibility to its actor.
  updates.created_by = profile.userId;

  // Board format only applies to Who's Cooking rows; NULL means the default
  // 'highlights' board, so 'highlights' is normalized to NULL before storage.
  if ('format' in updates) {
    const fmt = updates.format;
    if (fmt !== null && fmt !== 'highlights' && fmt !== 'classic') {
      return NextResponse.json({ error: "Invalid format (use 'highlights' or 'classic')" }, { status: 400 });
    }
    let reportType = updates.report_type;
    if (!('report_type' in updates)) {
      const admin = await createAdminClient();
      const { data: existing } = await admin
        .from('report_schedules')
        .select('report_type')
        .eq('id', id)
        .eq('tenant_id', profile.tenantId)
        .maybeSingle();
      reportType = existing?.report_type;
    }
    updates.format = reportType === 'whos-cooking' && fmt === 'classic' ? 'classic' : null;
  } else if ('report_type' in updates && updates.report_type !== 'whos-cooking') {
    // Retyping a schedule away from Who's Cooking clears any stale format.
    updates.format = null;
  }

  // If frequency changed, recompute next_run_at
  if ('cron_label' in updates) {
    if (!isValidFrequency(String(updates.cron_label))) {
      return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 });
    }
    updates.cron_expression = updates.cron_label;
    updates.next_run_at     = nextRunFromLabel(String(updates.cron_label)).toISOString();
  }
  if ('webhook_url' in updates) {
    const kind = detectWebhookKind(String(updates.webhook_url));
    if (!kind) {
      return NextResponse.json({ error: 'Webhook URL must be Discord or Slack' }, { status: 400 });
    }
    if (!('destination_kind' in updates)) updates.destination_kind = kind;
  }
  // If we just toggled active back on, advance next_run_at to a future time
  if (updates.active === true && !('cron_label' in updates)) {
    // Look up current cron_label to recompute
    const admin = await createAdminClient();
    const { data: existing } = await admin
      .from('report_schedules')
      .select('cron_label')
      .eq('id', id)
      .eq('tenant_id', profile.tenantId)
      .maybeSingle();
    if (existing?.cron_label) {
      updates.next_run_at = nextRunFromLabel(existing.cron_label).toISOString();
    }
  }

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from('report_schedules')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', profile.tenantId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schedule: data });
}

// DELETE /api/schedules/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getWorkspaceScope();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const lookup = await createAdminClient();
  const { data: existing, error: lookupError } = await lookup.from('report_schedules')
    .select('*').eq('id', id).eq('tenant_id', profile.tenantId).maybeSingle();
  if (lookupError) return NextResponse.json({ error: 'Schedule lookup failed' }, { status: 500 });
  if (!existing || !await canAccessSchedule(profile, existing, 'write')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = await createAdminClient();
  const { error } = await admin
    .from('report_schedules')
    .delete()
    .eq('id', id)
    .eq('tenant_id', profile.tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
