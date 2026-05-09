/**
 * POST /api/integrations/[id]/test-send
 *
 * Fires a single test action through an integration to confirm the
 * connection works. Logs an automation_runs row regardless of outcome so
 * we have an audit trail.
 *
 * Currently supports:
 *   - discord: sends a message to a channel id
 *
 * If the integration id is a legacy auto-detected one (`legacy:discord:<brand_id>`)
 * we promote it into the managed `integrations` table on first use, so the
 * row stops being "auto" and starts being a real, editable connection.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';
import { sendDiscordMessage } from '@/lib/integrations/actions/discord';

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

  const supabase = await createAdminClient();

  // Resolve the integration. Legacy ids look like `legacy:discord:<brand_id>` —
  // promote to managed before firing.
  let integrationId: string;
  let integrationType: string;
  let brandId: string | null = null;

  if (id.startsWith('legacy:')) {
    const [, type, legacyBrandId] = id.split(':');
    if (type !== 'discord') {
      return NextResponse.json({ error: `legacy ${type} integrations don't support test-send yet` }, { status: 400 });
    }
    // Read brand to get guild_id for the integration config
    const { data: brand } = await supabase
      .from('brands_v2')
      .select('id, name, display_name, discord_guild_id')
      .eq('id', legacyBrandId)
      .maybeSingle();
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    if (!brand.discord_guild_id) {
      return NextResponse.json({ error: 'Brand has no Discord guild configured' }, { status: 400 });
    }

    // Promote to managed integration row
    const { data: created, error: createErr } = await supabase
      .from('integrations')
      .insert({
        tenant_id: profile.tenant_id,
        brand_id: brand.id,
        type: 'discord',
        display_name: `${brand.display_name || brand.name} Server`,
        config: {
          guild_id: brand.discord_guild_id,
          default_channel_id: channelId, // remember the channel they tested with
        },
        status: 'connected',
      })
      .select('id, type, brand_id')
      .single();
    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 });
    integrationId = created.id;
    integrationType = created.type;
    brandId = created.brand_id;
  } else {
    const { data: row, error: loadErr } = await supabase
      .from('integrations')
      .select('id, type, brand_id, config')
      .eq('id', id)
      .maybeSingle();
    if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    integrationId = row.id;
    integrationType = row.type;
    brandId = row.brand_id;
  }

  // Open a run row so we have an audit record even if dispatch crashes.
  const { data: run } = await supabase
    .from('automation_runs')
    .insert({
      integration_id: integrationId,
      action: 'test_send',
      status: 'running',
      triggered_by: `manual:${profile.user_id}`,
    })
    .select('id')
    .single();

  // Dispatch
  let dispatchResult: { ok: boolean; status?: number; error?: string; messageId?: string };
  switch (integrationType) {
    case 'discord':
      dispatchResult = await sendDiscordMessage({ channelId, content });
      break;
    default:
      dispatchResult = { ok: false, error: `${integrationType} test-send not implemented yet` };
  }

  // Close out the run + update integration status
  const finalStatus = dispatchResult.ok ? 'success' : 'failed';
  if (run) {
    await supabase
      .from('automation_runs')
      .update({
        status: finalStatus,
        finished_at: new Date().toISOString(),
        step_results: [{
          action: 'test_send',
          channel_id: channelId,
          ok: dispatchResult.ok,
          message_id: dispatchResult.messageId ?? null,
          error: dispatchResult.error ?? null,
        }],
        error_message: dispatchResult.error ?? null,
      })
      .eq('id', run.id);
  }

  await supabase
    .from('integrations')
    .update({
      status: dispatchResult.ok ? 'connected' : 'error',
      last_used_at: new Date().toISOString(),
      ...(dispatchResult.ok
        ? { last_error_at: null, last_error_message: null }
        : { last_error_at: new Date().toISOString(), last_error_message: dispatchResult.error ?? null }
      ),
    })
    .eq('id', integrationId);

  if (!dispatchResult.ok) {
    return NextResponse.json({
      ok: false,
      error: dispatchResult.error,
      status: dispatchResult.status,
      run_id: run?.id ?? null,
      integration_id: integrationId,
      brand_id: brandId,
    }, { status: 200 }); // 200 because we successfully recorded the failure
  }

  return NextResponse.json({
    ok: true,
    message_id: dispatchResult.messageId,
    run_id: run?.id ?? null,
    integration_id: integrationId,
    brand_id: brandId,
    promoted: id.startsWith('legacy:'),
  });
}
