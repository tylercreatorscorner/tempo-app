import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { getBrandRegistry } from '@/lib/data/brand-registry';
import { resolveAudience, AudienceError } from '@/lib/comms/audience';
import { resolveTokens } from '@/lib/comms/tokens';
import {
  loadRequestCriteria, brandScopeViolation, parseChannel, canViewBroadcast,
  fetchRecipientCounts, emptyCounts, type BroadcastRow,
} from '@/lib/comms/broadcasts';

export const runtime = 'nodejs';
// Create replays the full roster export + two perf RPCs + chunked inserts —
// multiple seconds warm, worse cold. Without this a default-timeout kill
// mid-enqueue left half-built broadcasts (now also guarded by 'enqueuing').
export const maxDuration = 60;

// Recipient inserts go in chunks — a 5k-recipient audience in one PostgREST
// call would blow the request payload cap (house rule from /upload: chunk by
// size, never assume one giant write lands).
const INSERT_CHUNK = 500;

// GET /api/broadcasts — newest-first history (limit 50) with per-status counts.
export async function GET() {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from('broadcasts')
    .select('id, tenant_id, segment_id, audience_label, criteria, channel, template_key, body, status, created_by, created_at, started_at, finished_at')
    .eq('tenant_id', scope.tenantId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Brand-scoped managers only see broadcasts they could have created.
  const rows = ((data as BroadcastRow[] | null) ?? []).filter((b) => canViewBroadcast(scope, b));

  const counts = await fetchRecipientCounts(rows.map((b) => b.id));
  if (counts === null) {
    return NextResponse.json({ error: 'Failed to load recipient counts' }, { status: 500 });
  }

  return NextResponse.json({
    broadcasts: rows.map((b) => ({
      id: b.id,
      audienceLabel: b.audience_label,
      channel: b.channel,
      status: b.status,
      createdAt: b.created_at,
      createdBy: b.created_by,
      counts: counts.get(b.id) ?? emptyCounts(),
    })),
  });
}

// POST /api/broadcasts — resolve audience, personalize, enqueue.
// Body: { segmentId?, criteria?, channel, audienceLabel, body (1..2000), templateKey? }
export async function POST(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let payload: {
    segmentId?: unknown; criteria?: unknown; channel?: unknown;
    audienceLabel?: unknown; body?: unknown; templateKey?: unknown;
    idempotencyKey?: unknown;
  };
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const channel = parseChannel(payload.channel);
  if (!channel) return NextResponse.json({ error: 'Invalid channel' }, { status: 400 });
  // Phase A: only discord_dm broadcasts may be CREATED. email/sms preview
  // works (counts are useful), but nothing un-sendable is ever enqueued.
  if (channel !== 'discord_dm') {
    return NextResponse.json({ error: 'Channel not yet enabled' }, { status: 400 });
  }

  const audienceLabel = typeof payload.audienceLabel === 'string' ? payload.audienceLabel.trim() : '';
  if (!audienceLabel) return NextResponse.json({ error: 'audienceLabel is required' }, { status: 400 });

  const body = typeof payload.body === 'string' ? payload.body : '';
  if (body.trim().length < 1 || body.length > 2000) {
    return NextResponse.json({ error: 'body must be 1..2000 characters' }, { status: 400 });
  }
  const templateKey = typeof payload.templateKey === 'string' && payload.templateKey ? payload.templateKey : null;

  const loaded = await loadRequestCriteria(scope, payload);
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const { criteria, segmentId } = loaded;

  const violation = brandScopeViolation(scope, criteria);
  if (violation) return NextResponse.json({ error: violation }, { status: 403 });

  let audience;
  try {
    audience = await resolveAudience(scope, criteria, channel);
  } catch (err) {
    if (err instanceof AudienceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[/api/broadcasts] audience resolve failed:', err);
    return NextResponse.json({ error: 'Failed to resolve audience' }, { status: 500 });
  }

  const admin = await createAdminClient();
  const reg = await getBrandRegistry();

  // Idempotency: the client mints a uuid per review step. A timed-out create
  // + operator retry must return the EXISTING broadcast, never enqueue the
  // whole audience a second time (everyone would be DMed twice).
  const idempotencyKey =
    typeof payload.idempotencyKey === 'string' && payload.idempotencyKey.length >= 8
      ? payload.idempotencyKey.slice(0, 64)
      : null;
  if (idempotencyKey) {
    const { data: existing } = await admin
      .from('broadcasts')
      .select('id')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ id: (existing as { id: string }).id, deduped: true }, { status: 200 });
    }
  }

  // 1. The broadcast shell — born NON-claimable ('enqueuing') and flipped to
  // 'queued' only after the last recipient chunk commits. Inserting it as
  // 'queued' opened a race where a mid-window cron tick found zero pending
  // recipients and finalized the whole broadcast 'done' before its rows
  // existed (stranded forever, UI showing complete).
  const { data: inserted, error: insErr } = await admin
    .from('broadcasts')
    .insert({
      tenant_id: scope.tenantId,
      segment_id: segmentId,
      audience_label: audienceLabel,
      criteria,
      channel,
      template_key: templateKey,
      body,
      status: 'enqueuing',
      created_by: scope.email,
      idempotency_key: idempotencyKey,
    })
    .select('id')
    .single();
  if (insErr || !inserted) {
    // 23505 = unique violation on the idempotency index: a concurrent retry
    // won the race — hand back its broadcast.
    if (insErr?.code === '23505' && idempotencyKey) {
      const { data: winner } = await admin
        .from('broadcasts').select('id').eq('idempotency_key', idempotencyKey).maybeSingle();
      if (winner) return NextResponse.json({ id: (winner as { id: string }).id, deduped: true }, { status: 200 });
    }
    return NextResponse.json({ error: insErr?.message ?? 'Failed to create broadcast' }, { status: 500 });
  }
  const broadcastId = (inserted as { id: string }).id;

  // 2. Recipient rows — eligible get their PERSONALIZED body frozen now;
  // skipped rows are recorded with their reason (the delivery log is the
  // full audience, not just the sends).
  const recipientRows = [
    ...audience.eligible.map((r) => ({
      broadcast_id: broadcastId,
      creator_id: r.creatorId,
      handle: r.handle || null,
      display_name: r.displayName,
      channel,
      contact_value: r.contactValue,
      resolved_body: resolveTokens(body, r, reg),
      status: 'pending' as const,
    })),
    ...audience.skipped.map((r) => ({
      broadcast_id: broadcastId,
      creator_id: r.creatorId,
      handle: r.handle || null,
      display_name: r.displayName,
      channel,
      contact_value: null,
      resolved_body: null,
      status: 'skipped' as const,
      skip_reason: r.reason,
    })),
  ];

  for (let i = 0; i < recipientRows.length; i += INSERT_CHUNK) {
    const { error: recErr } = await admin
      .from('broadcast_recipients')
      .insert(recipientRows.slice(i, i + INSERT_CHUNK));
    if (recErr) {
      // Mark failed — NEVER delete. The shell is 'enqueuing' (not claimable)
      // so nothing sent, but a delete would be unsafe if that invariant ever
      // slips: it cascades away rows that are the only delivery record.
      await admin
        .from('broadcasts')
        .update({ status: 'failed', finished_at: new Date().toISOString() })
        .eq('id', broadcastId);
      return NextResponse.json({ error: `Failed to enqueue recipients: ${recErr.message}` }, { status: 500 });
    }
  }

  // 3. Every chunk landed — NOW it becomes claimable.
  const { error: readyErr } = await admin
    .from('broadcasts')
    .update({ status: 'queued' })
    .eq('id', broadcastId)
    .eq('status', 'enqueuing');
  if (readyErr) {
    return NextResponse.json({ error: `Broadcast enqueued but not activated: ${readyErr.message}` }, { status: 500 });
  }

  return NextResponse.json({
    id: broadcastId,
    eligible: audience.eligible.length,
    skipped: audience.skipped.length,
  }, { status: 201 });
}
