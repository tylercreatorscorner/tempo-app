/**
 * POST /api/integrations/[id]/test-send
 *
 * Generic test-send entrypoint. Accepts:
 *   { action: 'send_email', params: { to, subject, body } }
 *
 * For backward compat with the original Discord-only shape:
 *   { channel_id, content }
 * is rewritten to { action: 'send_message', params: { channel_id, content } }
 * before dispatch.
 *
 * The dispatcher does all the heavy lifting (legacy-id promotion, run
 * logging, integration status updates).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { dispatch } from '@/lib/automations/dispatch';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface PostBody {
  action?: string;
  params?: Record<string, unknown>;
  // Legacy fields — auto-mapped to send_message for back-compat with the
  // original Discord channel + content drawer.
  channel_id?: string;
  content?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  let body: PostBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Resolve the action + params, supporting both the new generic shape and
  // the legacy Discord-only shape.
  let action: string;
  let actionParams: Record<string, unknown>;

  if (body.action) {
    action = body.action;
    actionParams = body.params ?? {};
  } else if (body.channel_id) {
    action = 'send_message';
    actionParams = {
      channel_id: body.channel_id.trim(),
      content: (body.content ?? 'Test message from Tempo 👋').trim(),
    };
  } else {
    return NextResponse.json({ error: 'action and params are required' }, { status: 400 });
  }

  const result = await dispatch({
    integrationId: id,
    steps: [{ action, params: actionParams }],
    triggeredBy: `manual:${profile.user_id}`,
  });

  const firstStep = result.stepResults[0];
  if (result.status === 'success') {
    return NextResponse.json({
      ok: true,
      external_id: firstStep?.externalId ?? null,
      // Keep legacy field name for the old Discord drawer that hasn't been
      // migrated to the new shape.
      message_id: firstStep?.externalId ?? null,
      run_id: result.runId,
      integration_id: result.integrationId,
      promoted: id.startsWith('legacy:'),
    });
  }

  return NextResponse.json({
    ok: false,
    error: result.errorMessage ?? firstStep?.error ?? 'Send failed',
    run_id: result.runId,
    integration_id: result.integrationId,
  }, { status: 200 });
}
