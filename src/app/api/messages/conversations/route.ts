import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { classifyCreator } from '@/lib/data/creator-status';
import { ACTIVE_BRANDS, BRAND_UUID_MAP, brandUuidToSlug } from '@/lib/utils/constants';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';

const ACTIVE_BRAND_UUIDS = [...ACTIVE_BRANDS].map(b => BRAND_UUID_MAP[b]).filter(Boolean);

export async function GET() {
  try {
    const scope = await getWorkspaceScope();
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = await createAdminClient();

    // Scoped (manager): only their brands. owner/admin: existing behavior.
    // The conversation list is emitted strictly from these brandRows, so this
    // bounds the manager's entire view. Empty scoped list → no rows.
    const brandUuids = scope.brandScope.kind === 'scoped'
      ? scope.brandScope.brandIds
      : ACTIVE_BRAND_UUIDS;

    // 1. Fetch creator_brands with creators_v2 for the allowed brands
    const { data: brandRows, error: brandErr } = await supabase
      .from('creator_brands')
      .select('creator_id, brand_id, retainer, creator:creators_v2(id, real_name, discord_id, discord_avatar)')
      .in('brand_id', brandUuids);

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
      .select('id, creator_id, discord_user_id, content, direction, channel, sent_at, status, read_at, topic')
      .order('sent_at', { ascending: false });

    if (msgErr) throw msgErr;

    const msgByCreator = new Map<string, {
      last_message: string;
      last_message_at: string;
      direction: string;
      channel: string;
      unread_count: number;
      message_count: number;
      latest_inbound_topic: string | null;
      open_topics: Set<string>;
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
          latest_inbound_topic: null,
          open_topics: new Set(),
        });
      }
      const entry = msgByCreator.get(cid)!;
      entry.message_count++;
      // Unread tracking (inbound + not yet read)
      if (msg.direction === 'inbound' && !msg.read_at) {
        entry.unread_count++;
        if (msg.topic) entry.open_topics.add(msg.topic);
      }
      // Latest inbound topic = the topic of the most recent inbound message.
      // Messages are sorted by sent_at DESC so the first inbound we see is the latest.
      if (msg.direction === 'inbound' && !entry.latest_inbound_topic && msg.topic) {
        entry.latest_inbound_topic = msg.topic;
      }
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
        // daily_video_product_stats is per video×product; Set<video_id>
        // below dedupes so video counts stay correct.
        .from('daily_video_product_stats')
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
      const aggregatedOpenTopics = new Set<string>();
      for (const cid of person.creator_ids) {
        const msg = msgByCreator.get(cid);
        if (!msg) continue;
        if (!bestMsg || new Date(msg.last_message_at) > new Date(bestMsg.last_message_at)) {
          bestMsg = msg;
        }
        msg.open_topics.forEach(t => aggregatedOpenTopics.add(t));
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
        latest_topic: bestMsg?.latest_inbound_topic || null,
        open_topics: [...aggregatedOpenTopics],
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
