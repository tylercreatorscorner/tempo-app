import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import {
  canViewBroadcast, fetchRecipientCounts, emptyCounts, type BroadcastRow,
} from '@/lib/comms/broadcasts';

export const runtime = 'nodejs';

// Problems first, then the in-flight/waiting rows, then successes, then skips.
const STATUS_ORDER = ['failed', 'blocked', 'sending', 'pending', 'sent', 'delivered', 'skipped'];
const RECIPIENT_CAP = 1000;

interface RecipientOut {
  handle: string | null;
  display_name: string | null;
  status: string;
  skip_reason: string | null;
  error: string | null;
  sent_at: string | null;
}

// GET /api/broadcasts/[id] — one broadcast + its delivery log (cap 1000 rows).
export async function GET(
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

  // Counts come from the FULL recipient set (one grouped read); the row list
  // is capped at 1000 for the wire.
  const [counts, recRes] = await Promise.all([
    fetchRecipientCounts([broadcast.id]),
    admin
      .from('broadcast_recipients')
      .select('handle, display_name, status, skip_reason, error, sent_at')
      .eq('broadcast_id', broadcast.id)
      .limit(RECIPIENT_CAP),
  ]);
  if (recRes.error) return NextResponse.json({ error: recRes.error.message }, { status: 500 });

  const rank = (s: string) => {
    const i = STATUS_ORDER.indexOf(s);
    return i === -1 ? STATUS_ORDER.length : i;
  };
  const recipients = ((recRes.data as RecipientOut[] | null) ?? []).sort((a, b) => {
    const d = rank(a.status) - rank(b.status);
    if (d !== 0) return d;
    return (a.handle ?? '').localeCompare(b.handle ?? '');
  });

  return NextResponse.json({
    broadcast: {
      id: broadcast.id,
      audienceLabel: broadcast.audience_label,
      channel: broadcast.channel,
      status: broadcast.status,
      createdAt: broadcast.created_at,
      createdBy: broadcast.created_by,
      counts: counts.get(broadcast.id) ?? emptyCounts(),
      body: broadcast.body,
      templateKey: broadcast.template_key,
    },
    recipients: recipients.map((r) => ({
      handle: r.handle,
      displayName: r.display_name,
      status: r.status,
      skipReason: r.skip_reason,
      error: r.error,
      sentAt: r.sent_at,
    })),
  });
}
