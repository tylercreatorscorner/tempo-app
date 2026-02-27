import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { classifyCreator } from '@/lib/data/creator-status';
import { ACTIVE_BRANDS, BRAND_UUID_MAP, brandUuidToSlug } from '@/lib/utils/constants';

const ACTIVE_BRAND_UUIDS = [...ACTIVE_BRANDS].map(b => BRAND_UUID_MAP[b]).filter(Boolean);

export async function GET() {
  try {
    const supabase = await createAdminClient();

    // 1. Fetch creator_brands with creators_v2 for active brands
    const { data: brandRows, error: brandErr } = await supabase
      .from('creator_brands')
      .select('creator_id, brand_id, retainer, creator:creators_v2(id, real_name, discord_id, discord_avatar)')
      .in('brand_id', ACTIVE_BRAND_UUIDS);

    if (brandErr) throw brandErr;

    // 1b. Fetch tiktok_accounts
    const { data: accounts } = await supabase
      .from('tiktok_accounts')
      .select('creator_id, tiktok_username');

    const accountsByCreator = new Map<string, string>();
    const nameToId = new Map<string, string>();
    for (const a of accounts ?? []) {
      if (!accountsByCreator.has(a.creator_id)) {
        accountsByCreator.set(a.creator_id, a.tiktok_username);
      }
      nameToId.set(a.tiktok_username.toLowerCase(), a.creator_id);
    }

    // Also map by real_name
    for (const br of brandRows ?? []) {
      const c = br.creator as any;
      if (c?.real_name) nameToId.set(c.real_name.toLowerCase(), c.id);
    }

    // 2. Fetch all messages
    const { data: messages, error: msgErr } = await supabase
      .from('creator_messages')
      .select('id, creator_id, discord_user_id, content, direction, channel, sent_at, status')
      .order('sent_at', { ascending: false });

    if (msgErr) throw msgErr;

    const msgByCreator = new Map<string, {
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
      if (msg.direction === 'inbound') entry.unread_count++;
    }

    // 3. Fetch video stats (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const videoStats = new Map<string, { total_videos: number; total_gmv: number }>();

    let vpPage = 0;
    const vpPageSize = 1000;
    let hasMore = true;
    while (hasMore) {
      const { data: vp } = await supabase
        .from('daily_video_product_stats')
        .select('tiktok_username, gmv')
        .gte('report_date', sevenDaysAgo)
        .range(vpPage * vpPageSize, (vpPage + 1) * vpPageSize - 1);

      for (const row of vp ?? []) {
        const cid = nameToId.get(row.tiktok_username?.toLowerCase());
        if (!cid) continue;
        const existing = videoStats.get(cid) || { total_videos: 0, total_gmv: 0 };
        existing.total_gmv += Number(row.gmv) || 0;
        videoStats.set(cid, existing);
      }
      hasMore = (vp?.length ?? 0) === vpPageSize;
      vpPage++;
    }

    // Post counts from daily_video_stats
    let vidPage = 0;
    hasMore = true;
    const postsByCreator = new Map<string, Set<string>>();
    while (hasMore) {
      const { data: vids } = await supabase
        .from('daily_video_stats')
        .select('video_id, tiktok_username')
        .gte('post_date', sevenDaysAgo)
        .range(vidPage * vpPageSize, (vidPage + 1) * vpPageSize - 1);

      for (const row of vids ?? []) {
        const cid = nameToId.get(row.tiktok_username?.toLowerCase());
        if (!cid) continue;
        if (!postsByCreator.has(cid)) postsByCreator.set(cid, new Set());
        postsByCreator.get(cid)!.add(row.video_id);
      }
      hasMore = (vids?.length ?? 0) === vpPageSize;
      vidPage++;
    }

    for (const [cid, videoIds] of postsByCreator) {
      const existing = videoStats.get(cid) || { total_videos: 0, total_gmv: 0 };
      existing.total_videos = videoIds.size;
      videoStats.set(cid, existing);
    }

    // 4. Deduplicate creators by discord_id or real_name
    const personMap = new Map<string, {
      creator_ids: string[];
      real_name: string;
      discord_id: string | null;
      discord_avatar: string | null;
      brands: string[];
      retainer: number;
      tiktok_handle: string | null;
    }>();

    for (const br of brandRows ?? []) {
      const c = br.creator as any;
      if (!c) continue;
      const brandSlug = brandUuidToSlug(br.brand_id) ?? br.brand_id;
      const personKey = c.discord_id || `name:${(c.real_name || '').toLowerCase()}`;

      const existing = personMap.get(personKey);
      if (existing) {
        if (!existing.creator_ids.includes(c.id)) existing.creator_ids.push(c.id);
        if (brandSlug && !existing.brands.includes(brandSlug)) existing.brands.push(brandSlug);
        existing.retainer += Number(br.retainer) || 0;
        if (!existing.discord_id && c.discord_id) existing.discord_id = c.discord_id;
        if (!existing.discord_avatar && c.discord_avatar) existing.discord_avatar = c.discord_avatar;
        if (!existing.tiktok_handle) existing.tiktok_handle = accountsByCreator.get(c.id) || null;
      } else {
        personMap.set(personKey, {
          creator_ids: [c.id],
          real_name: c.real_name || 'Unknown Creator',
          discord_id: c.discord_id || null,
          discord_avatar: c.discord_avatar || null,
          brands: brandSlug ? [brandSlug] : [],
          retainer: Number(br.retainer) || 0,
          tiktok_handle: accountsByCreator.get(c.id) || null,
        });
      }
    }

    // 5. Build conversation list
    const conversations = [...personMap.values()].map(person => {
      const primaryId = person.creator_ids[0];

      let bestMsg: any = undefined;
      for (const cid of person.creator_ids) {
        const msg = msgByCreator.get(cid);
        if (msg && (!bestMsg || new Date(msg.last_message_at) > new Date(bestMsg.last_message_at))) {
          bestMsg = msg;
        }
      }

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
