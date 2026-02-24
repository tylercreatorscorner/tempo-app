import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { classifyCreator } from '@/lib/data/creator-status';

export async function GET() {
  try {
    const supabase = await createAdminClient();

    // 1. Fetch ALL managed creators
    const { data: creators, error: creatorsErr } = await supabase
      .from('managed_creators')
      .select('id, real_name, brand, discord_id, account_1, retainer, discord_avatar')
      .order('real_name');

    if (creatorsErr) throw creatorsErr;

    // 2. Fetch all messages grouped by creator
    const { data: messages, error: msgErr } = await supabase
      .from('creator_messages')
      .select('id, creator_id, discord_user_id, content, direction, channel, sent_at, status')
      .order('sent_at', { ascending: false });

    if (msgErr) throw msgErr;

    // Build message summary per creator_id
    const msgByCreator = new Map<number, {
      last_message: string;
      last_message_at: string;
      direction: string;
      channel: string;
      unread_count: number;
      message_count: number;
    }>();

    for (const msg of messages ?? []) {
      const cid = msg.creator_id;
      if (!cid) continue;
      if (!msgByCreator.has(cid)) {
        msgByCreator.set(cid, {
          last_message: msg.content,
          last_message_at: msg.sent_at,
          direction: msg.direction,
          channel: msg.channel || 'dm',
          unread_count: 0,
          message_count: 0,
        });
      }
      const entry = msgByCreator.get(cid)!;
      entry.message_count++;
      if (msg.direction === 'inbound') {
        entry.unread_count++;
      }
    }

    // 3. Fetch video stats (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const creatorIds = (creators ?? []).map(c => c.id);
    
    const videoStats = new Map<number, { total_videos: number; total_gmv: number }>();
    // video_performance uses creator_name (not creator_id) and report_date (not date)
    // Build a name→id lookup from managed_creators using account names
    const nameToId = new Map<string, number>();
    for (const c of creators ?? []) {
      if (c.account_1) nameToId.set(c.account_1.toLowerCase(), c.id);
      nameToId.set(c.real_name.toLowerCase(), c.id);
    }

    // Fetch video performance for last 7 days (paginated)
    let vpPage = 0;
    const vpPageSize = 1000;
    let hasMore = true;
    while (hasMore) {
      const { data: vp } = await supabase
        .from('video_performance')
        .select('creator_name, gmv, video_id')
        .gte('report_date', sevenDaysAgo)
        .range(vpPage * vpPageSize, (vpPage + 1) * vpPageSize - 1);

      for (const row of vp ?? []) {
        const cid = nameToId.get(row.creator_name?.toLowerCase());
        if (!cid) continue;
        const existing = videoStats.get(cid) || { total_videos: 0, total_gmv: 0 };
        existing.total_videos++;
        existing.total_gmv += Number(row.gmv) || 0;
        videoStats.set(cid, existing);
      }
      hasMore = (vp?.length ?? 0) === vpPageSize;
      vpPage++;
    }

    // 4. Build conversation list (avatars already stored in managed_creators)
    const conversations = (creators ?? []).map(c => {
      const msg = msgByCreator.get(c.id);
      const stats = videoStats.get(c.id) || { total_videos: 0, total_gmv: 0 };
      const status = classifyCreator(stats.total_videos);

      return {
        creator_id: c.id,
        creator_name: c.real_name,
        discord_user_id: c.discord_id || null,
        tiktok_handle: c.account_1 || null,
        brand: c.brand || null,
        retainer_amount: c.retainer != null ? Number(c.retainer) : null,
        last_message: msg?.last_message || null,
        last_message_at: msg?.last_message_at || null,
        direction: msg?.direction || null,
        channel: msg?.channel || 'dm',
        unread_count: msg?.unread_count || 0,
        message_count: msg?.message_count || 0,
        total_videos_7d: stats.total_videos,
        total_gmv_7d: stats.total_gmv,
        status,
        discord_avatar: c.discord_avatar || null,
      };
    });

    return NextResponse.json({ conversations });
  } catch (err: unknown) {
    console.error('Failed to fetch conversations:', err);
    return NextResponse.json({ conversations: [], error: 'Failed to fetch conversations' }, { status: 200 });
  }
}
