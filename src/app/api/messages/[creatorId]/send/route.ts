import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope, type WorkspaceScope } from '@/lib/auth/workspace-scope';

/**
 * Confirms the creator is in the caller's tenant and — for scoped managers —
 * linked to one of their brands. Service-role bypasses RLS, so enforce here.
 */
async function authorizeCreator(
  scope: WorkspaceScope,
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  creatorId: string,
): Promise<NextResponse | null> {
  const { data: row } = await supabase
    .from('creators_v2').select('id')
    .eq('id', creatorId).eq('tenant_id', scope.tenantId).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
  if (scope.brandScope.kind === 'scoped') {
    const ids = scope.brandScope.brandIds;
    const { data: link } = await supabase
      .from('creator_brands').select('id').eq('creator_id', creatorId)
      .in('brand_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
      .limit(1);
    if (!link || link.length === 0) {
      return NextResponse.json({ error: 'Forbidden: creator not in your brands' }, { status: 403 });
    }
  }
  return null;
}

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

/** Send a DM via Discord REST API (no bot process needed) */
async function sendDiscordDM(userId: string, content: string): Promise<boolean> {
  if (!DISCORD_BOT_TOKEN) return false;

  try {
    // Step 1: Open/get DM channel with user
    const dmChannelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recipient_id: userId }),
    });

    if (!dmChannelRes.ok) return false;
    const dmChannel = await dmChannelRes.json();

    // Step 2: Send message in that DM channel
    const msgRes = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });

    return msgRes.ok;
  } catch {
    return false;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ creatorId: string }> }
) {
  try {
    const scope = await getWorkspaceScope();
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { creatorId } = await params;
    const { content } = await request.json();

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
    }

    const supabase = await createAdminClient();

    const denied = await authorizeCreator(scope, supabase, creatorId);
    if (denied) return denied;

    // Look up creator's Discord user ID
    const { data: creator } = await supabase
      .from('creators_v2')
      .select('discord_id, real_name')
      .eq('id', creatorId)
      .single();

    // Try to send via Discord if we have their Discord ID
    let status = 'sent';
    let discordUserId = creator?.discord_id ?? null;

    if (discordUserId && DISCORD_BOT_TOKEN) {
      const delivered = await sendDiscordDM(discordUserId, content.trim());
      status = delivered ? 'delivered' : 'failed';
    } else {
      // No Discord ID or no bot token — just log the message
      status = 'sent';
    }

    // Log to database
    const { data, error } = await supabase
      .from('creator_messages')
      .insert({
        creator_id: creatorId,
        discord_user_id: discordUserId,
        direction: 'outbound',
        channel: 'dm',
        content: content.trim(),
        status,
        sent_by: 'admin',
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ message: data });
  } catch (err: unknown) {
    console.error('Failed to send message:', err);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
