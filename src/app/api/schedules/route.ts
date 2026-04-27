import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { isValidFrequency, nextRunFromLabel } from '@/lib/data/schedule-frequency';
import { detectWebhookKind } from '@/lib/messaging/webhook';

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = await createAdminClient();
  const { data: profile } = await admin
    .from('user_profiles')
    .select('user_id, tenant_id, role')
    .eq('user_id', user.id)
    .maybeSingle();
  return profile;
}

// GET /api/schedules — list all schedules for the user's tenant
export async function GET() {
  const profile = await requireUser();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from('report_schedules')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schedules: data ?? [] });
}

// POST /api/schedules — create a new schedule
export async function POST(request: NextRequest) {
  const profile = await requireUser();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const {
    report_type, source, brand, period,
    cron_label, destination_kind, webhook_url, channel_label,
  } = body;

  // Validation
  if (!report_type || !source || !cron_label || !webhook_url) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (!['reporting', 'discord-posts'].includes(source)) {
    return NextResponse.json({ error: 'Invalid source' }, { status: 400 });
  }
  if (!isValidFrequency(cron_label)) {
    return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 });
  }
  const detectedKind = detectWebhookKind(webhook_url);
  if (!detectedKind) {
    return NextResponse.json({ error: 'Webhook URL must be a Discord or Slack incoming webhook' }, { status: 400 });
  }

  const next = nextRunFromLabel(cron_label);

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from('report_schedules')
    .insert({
      tenant_id: profile.tenant_id,
      created_by: profile.user_id,
      report_type,
      source,
      brand: brand || 'all',
      period: period || '7d',
      cron_expression: cron_label, // We use the label as the cron-key for now
      cron_label,
      destination_kind: destination_kind || detectedKind,
      webhook_url,
      channel_label: channel_label || null,
      active: true,
      next_run_at: next.toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schedule: data }, { status: 201 });
}
