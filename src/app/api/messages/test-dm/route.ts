import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/require-admin';

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

// Diagnostic: DMs an arbitrary Discord user id. Owner/admin only — an
// arbitrary-DM primitive must never be reachable by managers.
export async function POST(request: NextRequest) {
  try {
    const profile = await requireAdmin();
    if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { discordUserId, content } = await request.json();

    if (!discordUserId?.trim() || !content?.trim()) {
      return NextResponse.json({ error: 'Discord user ID and message are required' }, { status: 400 });
    }

    if (!DISCORD_BOT_TOKEN) {
      return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 });
    }

    // Step 1: Open DM channel
    const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recipient_id: discordUserId.trim() }),
    });

    if (!dmRes.ok) {
      const err = await dmRes.json().catch(() => ({}));
      return NextResponse.json({
        delivered: false,
        error: `Could not open DM channel: ${err.message || dmRes.statusText}`,
      });
    }

    const dmChannel = await dmRes.json();

    // Step 2: Send message
    const msgRes = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: content.trim() }),
    });

    if (!msgRes.ok) {
      const err = await msgRes.json().catch(() => ({}));
      return NextResponse.json({
        delivered: false,
        error: `Failed to send: ${err.message || msgRes.statusText}`,
      });
    }

    // Step 3: Log to database so it shows in Messages page
    try {
      const supabase = await createAdminClient();

      // Try to find creator by discord_id or discord_user_id
      const { data: creator } = await supabase
        .from('creators_v2')
        .select('id')
        .eq('discord_id', discordUserId.trim())
        .limit(1)
        .single();

      await supabase.from('creator_messages').insert({
        creator_id: creator?.id ?? null,
        discord_user_id: discordUserId.trim(),
        direction: 'outbound',
        channel: 'dm',
        content: content.trim(),
        status: 'delivered',
        sent_by: 'admin',
      });
    } catch {
      // Don't fail the DM send if logging fails
      console.error('[test-dm] Failed to log message to database');
    }

    return NextResponse.json({ delivered: true });
  } catch (err) {
    console.error('Test DM failed:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
