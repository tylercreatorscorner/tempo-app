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
    const videoStats = new Map<number, { total_videos: number; total_gmv: number }>();

    // Fetch video data (report_date based — matches TikTok's "Videos" count)
    // TikTok's "Videos" = unique videos with shoppable activity in the period
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
        const existing = videoStats.get(cid) || { total_videos: 0, total_gmv: 0, videoIds: new Set<string>() };
        (existing as any).videoIds = (existing as any).videoIds || new Set<string>();
        (existing as any).videoIds.add(row.video_id);
        existing.total_videos = (existing as any).videoIds.size;
        existing.total_gmv += Number(row.gmv) || 0;
        videoStats.set(cid, existing);
      }
      hasMore = (vp?.length ?? 0) === vpPageSize;
      vpPage++;
    }

    // 4. Deduplicate creators — same person can have rows across multiple brands
    // Group by discord_id first (most reliable), fall back to real_name
    const personMap = new Map<string, {
      creator_ids: number[];
      real_name: string;
      discord_id: string | null;
      discord_avatar: string | null;
      brands: string[];
      retainer: number;
      tiktok_handle: string | null;
    }>();

    for (const c of creators ?? []) {
      // Use discord_id as the unique person key, fall back to lowercase real_name
      const personKey = c.discord_id || `name:${(c.real_name || '').toLowerCase()}`;
      
      const existing = personMap.get(personKey);
      if (existing) {
        existing.creator_ids.push(c.id);
        if (c.brand && !existing.brands.includes(c.brand)) existing.brands.push(c.brand);
        existing.retainer += Number(c.retainer) || 0;
        if (!existing.discord_id && c.discord_id) existing.discord_id = c.discord_id;
        if (!existing.discord_avatar && c.discord_avatar) existing.discord_avatar = c.discord_avatar;
        if (!existing.tiktok_handle) existing.tiktok_handle = accountsByCreator.get(c.id) || null;
      } else {
        personMap.set(personKey, {
          creator_ids: [c.id],
          real_name: c.real_name || 'Unknown Creator',
          discord_id: c.discord_id || null,
          discord_avatar: c.discord_avatar || null,
          brands: c.brand ? [c.brand] : [],
          retainer: Number(c.retainer) || 0,
          tiktok_handle: accountsByCreator.get(c.id) || null,
        });
      }
    }

    // 5. Build conversation list from deduplicated people
    const conversations = [...personMap.values()].map(person => {
      // Use the first creator_id as the primary (for messaging)
      const primaryId = person.creator_ids[0];
      
      // Merge messages across all creator_ids
      let bestMsg: typeof msgByCreator extends Map<number, infer V> ? V : never = undefined as any;
      for (const cid of person.creator_ids) {
        const msg = msgByCreator.get(cid);
        if (msg && (!bestMsg || new Date(msg.last_message_at) > new Date(bestMsg.last_message_at))) {
          bestMsg = msg;
        }
      }

      // Merge video stats across all creator_ids
      let totalVideos = 0;
      let totalGmv = 0;
      for (const cid of person.creator_ids) {
        const stats = videoStats.get(cid);
        if (stats) {
          totalVideos += stats.total_videos;
          totalGmv += stats.total_gmv;
        }
      }

      const status = classifyCreator(totalVideos);

      return {
        creator_id: primaryId,
        creator_name: person.real_name,
        discord_user_id: person.discord_id,
        tiktok_handle: person.tiktok_handle,
        brand: person.brands.length === 1 ? person.brands[0] : person.brands.join(','),
        brands: person.brands,
        retainer_amount: person.retainer,
        last_message: bestMsg?.last_message || null,
        last_message_at: bestMsg?.last_message_at || null,
        direction: bestMsg?.direction || null,
        channel: bestMsg?.channel || 'dm',
        unread_count: bestMsg?.unread_count || 0,
        message_count: bestMsg?.message_count || 0,
        total_videos_7d: totalVideos,
        total_gmv_7d: totalGmv,
        status,
        discord_avatar: person.discord_avatar,
      };
    });

    return NextResponse.json({ conversations });
  } catch (err: unknown) {
    console.error('Failed to fetch conversations:', err);
    return NextResponse.json({ conversations: [], error: 'Failed to fetch conversations' }, { status: 200 });
  }
}
