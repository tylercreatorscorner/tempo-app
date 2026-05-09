/**
 * GET /api/integrations/[id]/channels
 *
 * Lists channels available for posting through this integration. Supports
 * Discord (uses bot token from env) and Slack (uses per-install access
 * token from credentials). Future integration types plug in by extending
 * resolveChannelPicker() in the registry.
 *
 * Handles legacy auto-detected ids (`legacy:discord:<brand_id>`) — the
 * legacy path reads guild_id from brands_v2 since the row doesn't exist
 * in the integrations table yet.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';
import { resolveChannelPicker } from '@/lib/integrations/actions/registry';

export const runtime = 'nodejs';
export const maxDuration = 15;

interface ResolvedConfig {
  type: string;
  config: Record<string, unknown>;
  credentials: Record<string, unknown> | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const supabase = await createAdminClient();

  let resolved: ResolvedConfig;
  if (id.startsWith('legacy:')) {
    const [, t, brandId] = id.split(':');
    if (t !== 'discord') {
      return NextResponse.json({ error: `legacy ${t} integrations don't expose channel listing` }, { status: 400 });
    }
    const { data: brand } = await supabase
      .from('brands_v2')
      .select('discord_guild_id')
      .eq('id', brandId)
      .maybeSingle();
    if (!brand?.discord_guild_id) {
      return NextResponse.json({ error: 'No Discord guild configured for this integration' }, { status: 400 });
    }
    resolved = { type: 'discord', config: { guild_id: brand.discord_guild_id }, credentials: null };
  } else {
    const { data: row } = await supabase
      .from('integrations')
      .select('type, config, credentials')
      .eq('id', id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    resolved = {
      type: row.type,
      config: (row.config ?? {}) as Record<string, unknown>,
      credentials: (row.credentials ?? null) as Record<string, unknown> | null,
    };
  }

  const result = await resolveChannelPicker(resolved.type, resolved.config, resolved.credentials);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 200 });
  }

  // Adapt PickerOption back to the legacy channel shape the UI expects so we
  // don't have to touch the consumer.
  const channels = (result.options ?? []).map(o => ({
    id: o.value,
    name: o.label,
    parentName: o.groupLabel ?? null,
    isAnnouncement: o.badge === '📢',
    badge: o.badge,
  }));

  return NextResponse.json({ channels });
}
