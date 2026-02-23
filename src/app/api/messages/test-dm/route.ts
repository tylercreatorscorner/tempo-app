import { NextRequest, NextResponse } from 'next/server';

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

export async function POST(request: NextRequest) {
  try {
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

    return NextResponse.json({ delivered: true });
  } catch (err) {
    console.error('Test DM failed:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
