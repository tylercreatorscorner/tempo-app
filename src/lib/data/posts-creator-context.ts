import 'server-only';
import { can } from '@/lib/auth/permissions';
import type { WorkspaceScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';
import { normalizeCreatorTag } from '@/lib/roster/creator-tags';
import type { PostRow } from './posts';

export interface PostCreatorContext {
  creator_id: string | null;
  creator_name: string | null;
  creator_tags: string[];
  /** Current roster metadata, not historical membership or delivery acceptance. */
  creator_context_status: 'ready' | 'unavailable';
}

type Client = Awaited<ReturnType<typeof createAdminClient>>;
type RecordRow = Record<string, unknown>;
const PAGE = 1000;
const MAX_PAGES = 50;
const normalizeHandle = (value: unknown) => typeof value === 'string' ? value.trim().replace(/^@+/, '').toLowerCase() : '';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key = (brand: string, handle: string) => JSON.stringify([brand, normalizeHandle(handle)]);
const unavailable = (): PostCreatorContext => ({ creator_id: null, creator_name: null, creator_tags: [], creator_context_status: 'unavailable' });

async function readRows(client: Client, table: string, columns: string, scope: WorkspaceScope,
  filterColumn: string, values: string[], signal: AbortSignal): Promise<RecordRow[]> {
  const rows: RecordRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    let query = client.from(table).select(columns).eq('tenant_id', scope.tenantId)
      .in(filterColumn, values).order('id').range(page * PAGE, (page + 1) * PAGE - 1);
    if (table === 'managed_creators') query = query.is('archived_at', null);
    const { data, error } = await query.abortSignal(signal);
    if (error || !data) throw new Error('Current creator context is unavailable.');
    rows.push(...data as unknown as RecordRow[]);
    if (data.length < PAGE) return rows;
  }
  // A bounded partial roster must never be represented as complete tag membership.
  throw new Error('Current creator context exceeds the readable window.');
}

/** Projects only explicit current relationships; conflicting identities stay unresolved. */
export function projectPostCreatorContext(posts: Pick<PostRow, 'brand_slug' | 'creator_handle'>[],
  brands: Map<string, string>, managed: RecordRow[], accounts: RecordRow[], links: RecordRow[],
  authorizedIds: Set<string>, creatorNames: Map<string, string> = new Map()): PostCreatorContext[] {
  const slugById = new Map([...brands].map(([slug, id]) => [id, slug]));
  const linked = new Set(links.flatMap(row => {
    const slug = slugById.get(String(row.brand_id));
    const id = String(row.creator_id ?? '');
    return slug && authorizedIds.has(id) ? [key(slug, id)] : [];
  }));
  const idsByHandle = new Map<string, Set<string>>();
  const addIdentity = (brand: string, handle: string, id: string) => {
    if (!handle || !authorizedIds.has(id) || !linked.has(key(brand, id))) return;
    const handleKey = key(brand, handle);
    const ids = idsByHandle.get(handleKey) ?? new Set<string>();
    ids.add(id); idsByHandle.set(handleKey, ids);
  };
  for (const row of accounts) {
    const brand = slugById.get(String(row.brand_id));
    if (brand) addIdentity(brand, normalizeHandle(row.tiktok_username), String(row.creator_id ?? ''));
  }
  const rowsByHandle = new Map<string, RecordRow[]>();
  const rowsByIdentity = new Map<string, RecordRow[]>();
  for (const row of managed) {
    const brand = String(row.brand ?? '');
    if (!brands.has(brand)) continue;
    const id = String(row.creator_id ?? '');
    if (authorizedIds.has(id) && linked.has(key(brand, id))) {
      const identityKey = key(brand, id);
      rowsByIdentity.set(identityKey, [...(rowsByIdentity.get(identityKey) ?? []), row]);
    }
    for (let index = 1; index <= 10; index++) {
      const handle = normalizeHandle(row[`account_${index}`]);
      if (!handle) continue;
      const handleKey = key(brand, handle);
      rowsByHandle.set(handleKey, [...(rowsByHandle.get(handleKey) ?? []), row]);
      if (id) addIdentity(brand, handle, id);
    }
  }
  return posts.map(post => {
    const handleKey = key(post.brand_slug, post.creator_handle);
    const ids = idsByHandle.get(handleKey) ?? new Set<string>();
    if (ids.size > 1) return unavailable();
    const creatorId = ids.size === 1 ? [...ids][0] : null;
    const matched = new Set(rowsByHandle.get(handleKey) ?? []);
    if (creatorId) for (const row of rowsByIdentity.get(key(post.brand_slug, creatorId)) ?? []) matched.add(row);
    // A roster FK pointing elsewhere must not assign that other creator's tags.
    const applicable = [...matched].filter(row => !row.creator_id || row.creator_id === creatorId);
    if ([...matched].some(row => row.creator_id && row.creator_id !== creatorId)) return unavailable();
    const tags = new Set<string>();
    for (const row of applicable) for (const raw of Array.isArray(row.tags) ? row.tags : []) {
      const tag = normalizeCreatorTag(raw);
      if (tag) tags.add(tag);
    }
    return { creator_id: creatorId, creator_name: creatorId ? creatorNames.get(creatorId) ?? null : null, creator_tags: [...tags].sort(), creator_context_status: 'ready' };
  });
}

/** Optional enrichment cannot turn a metadata failure into false "untagged" membership. */
export async function enrichPostCreators(scope: WorkspaceScope, posts: PostRow[]): Promise<(PostRow & PostCreatorContext)[]> {
  const fallback = () => posts.map(post => ({ ...post, ...unavailable() }));
  if (!posts.length) return [];
  if (!can(scope, 'posts', 'read') || !can(scope, 'roster', 'read')) return fallback();
  const requested = [...new Set(posts.map(post => post.brand_slug))];
  const brandScope = scope.brandScope;
  if (brandScope.kind === 'scoped' && requested.some(brand => !brandScope.brandSlugs.includes(brand))) return fallback();
  try {
    const client = await createAdminClient();
    const signal = AbortSignal.timeout(5_000);
    const { data, error } = await client.from('brands_v2').select('id,slug')
      .eq('tenant_id', scope.tenantId).in('slug', requested).eq('is_archived', false).abortSignal(signal);
    if (error || !data || data.length !== requested.length) return fallback();
    const brands = new Map<string, string>(data.map(row => [String(row.slug), String(row.id)]));
    const ids = [...brands.values()];
    const [managed, accounts, links] = await Promise.all([
      readRows(client, 'managed_creators', 'id,brand,creator_id,tags,account_1,account_2,account_3,account_4,account_5,account_6,account_7,account_8,account_9,account_10', scope, 'brand', requested, signal),
      readRows(client, 'tiktok_accounts', 'id,tiktok_username,creator_id,brand_id', scope, 'brand_id', ids, signal),
      readRows(client, 'creator_brands', 'id,creator_id,brand_id', scope, 'brand_id', ids, signal),
    ]);
    const candidates = [...new Set([...managed, ...accounts, ...links].map(row => String(row.creator_id ?? '')).filter(id => uuid.test(id)))];
    const authorizedIds = new Set<string>();
    const creatorNames = new Map<string, string>();
    for (let offset = 0; offset < candidates.length; offset += 200) {
      const { data: creators, error: creatorError } = await client.from('creators_v2').select('id,real_name')
        .eq('tenant_id', scope.tenantId).in('id', candidates.slice(offset, offset + 200)).abortSignal(signal);
      if (creatorError || !creators) return fallback();
      for (const creator of creators) {
        authorizedIds.add(String(creator.id));
        if (typeof creator.real_name === 'string' && creator.real_name.trim()) creatorNames.set(String(creator.id), creator.real_name.trim());
      }
    }
    const context = projectPostCreatorContext(posts, brands, managed, accounts, links, authorizedIds, creatorNames);
    return posts.map((post, index) => ({ ...post, ...context[index] }));
  } catch { return fallback(); }
}
