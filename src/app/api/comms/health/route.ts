import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';

export const runtime = 'nodejs';

// The bot heartbeats every 3 min; >10 min of silence = offline (the March
// incident: the DM pipeline died and NOTHING surfaced it — this is the gauge).
const ONLINE_WINDOW_MS = 10 * 60 * 1000;

// GET /api/comms/health → { botLastSeenAt, botOnline, latestMessageAt, inboundLast7d }
export async function GET() {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createAdminClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [botRes, latestRes, inboundRes] = await Promise.all([
    admin.from('bot_status').select('last_seen_at').eq('id', 1).maybeSingle(),
    admin.from('creator_messages').select('sent_at').order('sent_at', { ascending: false }).limit(1),
    admin.from('creator_messages')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'inbound')
      .gte('sent_at', sevenDaysAgo),
  ]);

  const botLastSeenAt = (botRes.data as { last_seen_at: string | null } | null)?.last_seen_at ?? null;
  const botOnline = botLastSeenAt !== null
    && Date.now() - new Date(botLastSeenAt).getTime() < ONLINE_WINDOW_MS;
  const latestMessageAt = ((latestRes.data as { sent_at: string | null }[] | null) ?? [])[0]?.sent_at ?? null;

  return NextResponse.json({
    botLastSeenAt,
    botOnline,
    latestMessageAt,
    inboundLast7d: inboundRes.count ?? 0,
  });
}
