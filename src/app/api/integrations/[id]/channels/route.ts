/**
 * GET /api/integrations/[id]/channels
 *
 * Lists channels available for posting through this integration.
 * Currently only supports Discord — uses the bot token to call
 * GET /guilds/{guild_id}/channels.
 *
 * Handles both managed integration ids and legacy auto-detected ids
 * (`legacy:discord:<brand_id>`). The legacy path reads guild_id from
 * brands_v2.discord_guild_id since the row doesn't exist in the
 * integrations table yet (it gets promoted on first test-send).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';
import { listDiscordChannels } from '@/lib/integrations/actions/discord';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const supabase = await createAdminClient();

  // Resolve type + guild_id from either a managed integration row or a
  // legacy `legacy:discord:<brand_id>` virtual id.
  let type: string;
  let guildId: string | null = null;

  if (id.startsWith('legacy:')) {
    const [, t, brandId] = id.split(':');
    type = t;
    if (type !== 'discord') {
      return NextResponse.json({ error: `legacy ${type} integrations don't expose channel listing` }, { status: 400 });
    }
    const { data: brand } = await supabase
      .from('brands_v2')
      .select('discord_guild_id')
      .eq('id', brandId)
      .maybeSingle();
    guildId = brand?.discord_guild_id ?? null;
  } else {
    const { data: row } = await supabase
      .from('integrations')
      .select('type, config')
      .eq('id', id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    type = row.type;
    if (type !== 'discord') {
      return NextResponse.json({ error: `Channel listing not supported for type "${type}" yet` }, { status: 400 });
    }
    guildId = (row.config as { guild_id?: string } | null)?.guild_id ?? null;
  }

  if (!guildId) {
    return NextResponse.json({ error: 'No Discord guild configured for this integration' }, { status: 400 });
  }

  const result = await listDiscordChannels(guildId);
  if (!result.ok) {
    return NextResponse.json({
      error: result.error,
      status: result.status,
    }, { status: 200 }); // 200 — surface the upstream error to the UI
  }

  return NextResponse.json({ channels: result.channels });
}
