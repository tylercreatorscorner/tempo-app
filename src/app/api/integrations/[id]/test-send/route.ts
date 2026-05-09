/**
 * POST /api/integrations/[id]/test-send
 *
 * Fires a single Discord 'send_message' action via the unified dispatcher.
 * The dispatcher handles legacy-id promotion, run logging, and integration
 * status updates — this route is just a thin adapter for the simpler shape
 * the UI passes (channel_id + content vs the generic params object).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { dispatch } from '@/lib/automations/dispatch';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface PostBody {
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

  const channelId = body.channel_id?.trim();
  const content = body.content?.trim() || 'Test message from Tempo 👋';
  if (!channelId) {
    return NextResponse.json({ error: 'channel_id is required' }, { status: 400 });
  }

  const result = await dispatch({
    integrationId: id,
    steps: [{ action: 'send_message', params: { channel_id: channelId, content } }],
    triggeredBy: `manual:${profile.user_id}`,
  });

  const firstStep = result.stepResults[0];
  if (result.status === 'success') {
    return NextResponse.json({
      ok: true,
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
