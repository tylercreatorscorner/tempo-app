import { createAdminClient } from '@/lib/supabase/server';
import { classifyCreator } from '@/lib/data/creator-status';
import { resolveUuids, uuidToSlug } from '@/lib/data/brand-registry-core';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { messageBrandRegistry, messageGuard, messageReply, messageRows } from '@/lib/messages/access';

export async function GET() {
  try {
    const scope = await getWorkspaceScope();
    const denied = messageGuard(scope);
    if (denied || !scope) return denied!;
    const db = await createAdminClient();
    const registry = await messageBrandRegistry(scope, db);
    const assignedIds = scope.brandScope.kind === 'scoped' ? new Set(scope.brandScope.brandIds) : null;
    // A directly assigned store is a valid roster boundary. Its parent is not
    // implicitly assigned; umbrella stores expand only for performance data.
    const rosterBrands = registry.rows.filter(row => !row.is_archived && (assignedIds ? assignedIds.has(row.id) : row.parent_brand_id == null));
    const brandIds = rosterBrands.map(row => row.id);
    const brandSlugs = rosterBrands.map(row => row.slug);
    const dataBrandIds = [...new Set(brandSlugs.flatMap(slug => resolveUuids(registry, slug) ?? []))];
    if (!brandIds.length) return messageReply({ conversations: [] });
    const links = await messageRows((from, through) => db.from('creator_brands')
      .select('creator_id,brand_id,retainer,creator:creators_v2(id,tenant_id,real_name,discord_id,discord_avatar)', { count: 'exact' })
      .eq('tenant_id', scope.tenantId).in('brand_id', brandIds).order('id').range(from, through));
    type Creator = { id: string; tenant_id: string; real_name: string | null; discord_id: string | null; discord_avatar: string | null };
    const rows = links.map(row => ({ ...row, creator: row.creator as unknown as Creator | null }));
    if (rows.some(row => !row.creator || row.creator.tenant_id !== scope.tenantId)) throw new Error('Invalid messaging roster');
    const creatorIds = [...new Set(rows.map(row => row.creator_id as string))];
    if (!creatorIds.length) return messageReply({ conversations: [] });
    const creatorSet = new Set(creatorIds);
    const [accounts, legacy] = await Promise.all([
      messageRows((from, through) => db.from('tiktok_accounts').select('creator_id,tiktok_username', { count: 'exact' }).eq('tenant_id', scope.tenantId).in('brand_id', [...new Set([...brandIds, ...dataBrandIds])]).order('id').range(from, through)),
      messageRows((from, through) => db.from('managed_creators').select('id,creator_id', { count: 'exact' }).eq('tenant_id', scope.tenantId).in('brand', brandSlugs).order('id').range(from, through)),
    ]);
    const accountsByCreator = new Map<string, string>();
    const nameToIds = new Map<string, Set<string>>();
    for (const account of accounts) {
      if (!creatorSet.has(account.creator_id) || !account.tiktok_username) continue;
      if (!accountsByCreator.has(account.creator_id)) accountsByCreator.set(account.creator_id, account.tiktok_username);
      const key = account.tiktok_username.toLowerCase();
      const matches = nameToIds.get(key) ?? new Set<string>(); matches.add(account.creator_id); nameToIds.set(key, matches);
    }
    const legacyToCreator = new Map(legacy.filter(row => creatorSet.has(row.creator_id)).map(row => [Number(row.id), row.creator_id as string]));
    const discordToCreator = new Map(rows.filter(row => row.creator?.discord_id).map(row => [row.creator!.discord_id!, row.creator_id as string]));
    const messages: Array<{ id: string; creator_id: number | null; creator_uuid: string | null; discord_user_id: string | null; content: string; direction: string; channel: string; sent_at: string; status: string; read_at: string | null; topic: string | null }> = [];
    const legacyIds = [...legacyToCreator.keys()];
    // Scoped readers fetch only their legacy brand rows. Batch the IDs so a
    // large roster cannot overflow the database API's URL limit.
    const batches = scope.brandScope.kind === 'all' ? [null] : Array.from({ length: Math.ceil(legacyIds.length / 250) }, (_, index) => legacyIds.slice(index * 250, index * 250 + 250));
    for (const batch of batches) {
      messages.push(...await messageRows((from, through) => {
        let query = db.from('creator_messages')
        .select('id,creator_id,creator_uuid,discord_user_id,content,direction,channel,sent_at,status,read_at,topic', { count: 'exact' })
        .eq('tenant_id', scope.tenantId);
        if (batch) query = query.in('creator_id', batch);
        return query.order('sent_at', { ascending: false }).order('id', { ascending: false }).range(from, through);
      }));
    }
    messages.sort((a, b) => b.sent_at.localeCompare(a.sent_at) || b.id.localeCompare(a.id));
    type Summary = { last_message: string; last_message_at: string; direction: string; channel: string; unread_count: number; message_count: number; latest_inbound_topic: string | null; open_topics: Set<string> };
    const summaries = new Map<string, Summary>();
    for (const message of messages) {
      const creatorId = scope.brandScope.kind === 'scoped' ? (message.creator_id ? legacyToCreator.get(message.creator_id) : undefined)
        : message.creator_uuid && creatorSet.has(message.creator_uuid) ? message.creator_uuid
        : message.creator_id ? legacyToCreator.get(message.creator_id)
          : scope.brandScope.kind === 'all' && message.discord_user_id ? discordToCreator.get(message.discord_user_id) : undefined;
      if (!creatorId) continue;
      let summary = summaries.get(creatorId);
      if (!summary) { summary = { last_message: message.content, last_message_at: message.sent_at, direction: message.direction, channel: message.channel || 'dm', unread_count: 0, message_count: 0, latest_inbound_topic: null, open_topics: new Set() }; summaries.set(creatorId, summary); }
      summary.message_count++;
      if (message.direction === 'inbound' && !message.read_at) { summary.unread_count++; if (message.topic) summary.open_topics.add(message.topic); }
      if (message.direction === 'inbound' && !summary.latest_inbound_topic && message.topic) summary.latest_inbound_topic = message.topic;
    }
    const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const metrics = new Map<string, { gmv: number; videos: Set<string> }>();
    let performanceAvailable = true;
    try {
      for (const basis of ['report_date', 'post_date'] as const) {
        for (let page = 0; ; page++) {
          const result = await db.from('daily_video_product_stats').select('id,video_id,tiktok_username,gmv', { count: 'exact' })
            .eq('tenant_id', scope.tenantId).in('brand_id', dataBrandIds).gte(basis, since).order('id').range(page * 1000, page * 1000 + 999);
          if (result.error || !result.data || result.count === null || result.data.length !== Math.min(1000, Math.max(0, result.count - page * 1000))) throw new Error('Creator performance unavailable');
          for (const row of result.data) {
            const matches = nameToIds.get(row.tiktok_username?.toLowerCase());
            if (matches?.size !== 1) continue;
            const creatorId = [...matches][0];
            const metric = metrics.get(creatorId) ?? { gmv: 0, videos: new Set<string>() };
            if (basis === 'report_date') metric.gmv += Number(row.gmv) || 0;
            else if (row.video_id) metric.videos.add(row.video_id);
            metrics.set(creatorId, metric);
          }
          if ((page + 1) * 1000 >= result.count) break;
          if (result.data.length !== 1000) throw new Error('Incomplete creator performance');
        }
      }
    } catch { performanceAvailable = false; metrics.clear(); }
    const people = new Map<string, { ids: Set<string>; creator: Creator; brands: Set<string>; retainer: number }>();
    for (const row of rows) {
      const creator = row.creator!;
      const key = scope.brandScope.kind === 'scoped' ? `creator:${creator.id}` : creator.discord_id || `creator:${creator.id}`;
      const person = people.get(key) ?? { ids: new Set<string>(), creator, brands: new Set<string>(), retainer: 0 };
      person.ids.add(creator.id); person.brands.add(uuidToSlug(registry, row.brand_id) ?? row.brand_id); person.retainer += Number(row.retainer) || 0;
      people.set(key, person);
    }
    const conversations = [...people.entries()].map(([key, person]) => {
      const history = [...person.ids].map(id => summaries.get(id)).filter((value): value is Summary => Boolean(value));
      const best = history.sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))[0];
      const videos = new Set([...person.ids].flatMap(id => [...(metrics.get(id)?.videos ?? [])]));
      const brands = [...person.brands];
      return { conversation_key: key, creator_id: person.creator.id, creator_name: person.creator.real_name || 'Unknown Creator', discord_user_id: person.creator.discord_id,
        tiktok_handle: [...person.ids].map(id => accountsByCreator.get(id)).find(Boolean) ?? null, brand: brands.join(','), brands, retainer_amount: person.retainer,
        last_message: best?.last_message ?? null, last_message_at: best?.last_message_at ?? null, direction: best?.direction ?? null, channel: best?.channel ?? 'dm',
        unread_count: history.reduce((sum, item) => sum + item.unread_count, 0), message_count: history.reduce((sum, item) => sum + item.message_count, 0),
        latest_topic: best?.latest_inbound_topic ?? null, open_topics: [...new Set(history.flatMap(item => [...item.open_topics]))],
        total_videos_7d: performanceAvailable ? videos.size : null,
        total_gmv_7d: performanceAvailable ? [...person.ids].reduce((sum, id) => sum + (metrics.get(id)?.gmv ?? 0), 0) : null,
        performance_available: performanceAvailable, status: performanceAvailable ? classifyCreator(videos.size) : 'unavailable', discord_avatar: person.creator.discord_avatar };
    });
    return messageReply({ conversations });
  } catch {
    return messageReply({ error: 'Could not load conversations. Please retry.' }, 503);
  }
}
