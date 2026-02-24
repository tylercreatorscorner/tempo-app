import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { classifyCreator } from '@/lib/data/creator-status';
import { ACTIVE_BRANDS } from '@/lib/utils/constants';

export async function GET() {
  try {
    const supabase = await createAdminClient();

    // 1. Fetch managed creators (active brands only)
    const { data: creators, error: creatorsErr } = await supabase
      .from('managed_creators')
      .select('id, real_name, brand, discord_id, retainer, discord_avatar')
      .in('brand', ACTIVE_BRANDS)
      .order('real_name');

    if (creatorsErr) throw creatorsErr;

    // 1b. Fetch creator_accounts for tiktok_username → creator_id mapping
    const { data: accounts } = await supabase
      .from('creator_accounts')
      .select('creator_id, tiktok_username');

    const accountsByCreator = new Map<number, string>();
    const nameToId = new Map<string, number>();
    for (const a of accounts ?? []) {
      if (!accountsByCreator.has(a.creator_id)) {
        accountsByCreator.set(a.creator_id, a.tiktok_username);
      }
      nameToId.set(a.tiktok_username.toLowerCase(), a.creator_id);
    }
    // Also map by real_name as fallback
    for (const c of creators ?? []) {
      if (c.real_name) nameToId.set(c.real_name.toLowerCase(), c.id);
    }

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
    const videoStats = new Map<number, { total_videos: number; total_gmv: number; videoIds: Set<string> }>();

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
        const existing = videoStats.get(cid) || { total_videos: 0, total_gmv: 0, videoIds: new Set() };
        existing.videoIds.add(row.video_id);
        existing.total_videos = existing.videoIds.size;
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
        creator_name: c.real_name || 'Unknown Creator',
        discord_user_id: c.discord_id || null,
        tiktok_handle: accountsByCreator.get(c.id) || null,
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
