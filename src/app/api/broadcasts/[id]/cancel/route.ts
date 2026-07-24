import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { canViewBroadcast, type BroadcastRow } from '@/lib/comms/broadcasts';

export const runtime = 'nodejs';

// POST /api/broadcasts/[id]/cancel — stop a queued/sending broadcast.
// Pending recipients become skipped ('canceled'); anything already sent stays
// in the log as-is. An in-flight 'sending' recipient (at most one per cron
// tick) finishes its send — cancel stops the QUEUE, it can't unsend a DM.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const admin = await createAdminClient();

  const { data, error } = await admin
    .from('broadcasts')
    .select('id, tenant_id, segment_id, audience_label, criteria, channel, template_key, body, status, created_by, created_at, started_at, finished_at')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const broadcast = data as BroadcastRow | null;
  if (!broadcast) return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 });
  if (!canViewBroadcast(scope, broadcast)) {
    return NextResponse.json({ error: 'Forbidden: brand not in your access' }, { status: 403 });
  }
  if (broadcast.status !== 'queued' && broadcast.status !== 'sending') {
    return NextResponse.json({ error: `Broadcast is already ${broadcast.status}` }, { status: 400 });
  }

  // Flip the broadcast first — the cron drain only claims queued/sending, so
  // once this lands no new recipient batch gets picked up.
  const { error: bErr } = await admin
    .from('broadcasts')
    .update({ status: 'canceled', finished_at: new Date().toISOString() })
    .eq('id', broadcast.id)
    .in('status', ['queued', 'sending']);
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });

  const { error: rErr } = await admin
    .from('broadcast_recipients')
    .update({ status: 'skipped', skip_reason: 'canceled' })
    .eq('broadcast_id', broadcast.id)
    .eq('status', 'pending');
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  return NextResponse.json({ id: broadcast.id, status: 'canceled' });
}
