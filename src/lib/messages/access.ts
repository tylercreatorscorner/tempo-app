import { NextResponse } from 'next/server';
import { can } from '@/lib/auth/permissions';
import type { WorkspaceScope } from '@/lib/auth/workspace-scope';
import type { createAdminClient } from '@/lib/supabase/server';
import { buildRegistry, type BrandRow } from '@/lib/data/brand-registry-core';

type Database = Awaited<ReturnType<typeof createAdminClient>>;
export const messageReply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export const isCreatorUuid = (value: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export const isDiscordId = (value: string) => /^\d{15,25}$/.test(value);

/** Stable ordered reads must request every page, not trust the default API cap. */
export async function messageRows<T>(readPage: (from: number, through: number) => PromiseLike<{ data: T[] | null; error: unknown; count: number | null }>) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await readPage(offset, offset + 999);
    if (result.error || !result.data || result.count === null
      || result.data.length !== Math.min(1000, Math.max(0, result.count - offset))) throw new Error('Incomplete messaging data');
    rows.push(...result.data);
    if (offset + result.data.length >= result.count) return rows;
  }
}

export function messageGuard(scope: WorkspaceScope | null, write = false) {
  if (!scope) return messageReply({ error: 'Unauthorized' }, 401);
  if (!scope.tenantId || !scope.userId || !can(scope, 'messages', 'read')
    || (write && (!can(scope, 'messages', 'write') || scope.impersonating))) return messageReply({ error: 'Forbidden' }, 403);
  return null;
}

export async function messageCreator(scope: WorkspaceScope, db: Database, creatorId: string) {
  if (!isCreatorUuid(creatorId)) return messageReply({ error: 'Invalid creator' }, 400);
  const { data: creator, error } = await db.from('creators_v2').select('id,discord_id,real_name,discord_avatar')
    .eq('tenant_id', scope.tenantId).eq('id', creatorId).maybeSingle();
  if (error) throw new Error('Could not verify creator access.');
  if (!creator) return messageReply({ error: 'Creator not found' }, 404);
  if (scope.brandScope.kind === 'scoped') {
    if (!scope.brandScope.brandIds.length) return messageReply({ error: 'Creator is outside your brands' }, 403);
    const links = await db.from('creator_brands').select('id').eq('tenant_id', scope.tenantId)
      .eq('creator_id', creatorId).in('brand_id', scope.brandScope.brandIds).limit(1);
    if (links.error) throw new Error('Could not verify creator access.');
    if (!links.data?.length) return messageReply({ error: 'Creator is outside your brands' }, 403);
  }
  return creator;
}

export async function messageLegacyIds(scope: WorkspaceScope, db: Database, creatorId: string) {
  let query = db.from('managed_creators').select('id', { count: 'exact' })
    .eq('tenant_id', scope.tenantId).eq('creator_id', creatorId);
  if (scope.brandScope.kind === 'scoped') query = query.in('brand', scope.brandScope.brandSlugs);
  const legacy = await query;
  if (legacy.error || !legacy.data || legacy.count !== legacy.data.length) throw new Error('Could not verify message history.');
  const ids = legacy.data.map(row => Number(row.id));
  if (ids.some(value => !Number.isSafeInteger(value) || value <= 0)) throw new Error('Invalid legacy creator identity.');
  return ids;
}

/** Apply only to a tenant-constrained query. Legacy IDs come from owned rows. */
export async function messageTarget(scope: WorkspaceScope, db: Database, creatorId: string, discordId: string | null) {
  if (discordId && !isDiscordId(discordId)) return messageReply({ error: 'Invalid Discord account' }, 400);
  if (creatorId === '0' && discordId && scope.brandScope.kind === 'all') return `discord_user_id.eq.${discordId}`;
  const creator = await messageCreator(scope, db, creatorId);
  if (creator instanceof NextResponse) return creator;
  if (discordId && scope.brandScope.kind === 'all') {
    if (discordId !== creator.discord_id) return messageReply({ error: 'Discord account does not match this creator' }, 400);
    return `discord_user_id.eq.${discordId}`;
  }
  const ids = await messageLegacyIds(scope, db, creatorId);
  // A canonical creator or Discord DM can span several brands. Only the
  // legacy roster identity establishes a brand for a message; global UUID/
  // Discord rows must never widen a brand-scoped member's conversation.
  if (scope.brandScope.kind === 'scoped') {
    if (!ids.length) return messageReply({ error: 'Brand-specific message history is unavailable for this creator' }, 403);
    return `creator_id.in.(${ids.join(',')})`;
  }
  return `creator_uuid.eq.${creatorId}${ids.length ? `,creator_id.in.(${ids.join(',')})` : ''}`;
}

export async function messageBrandRegistry(scope: WorkspaceScope, db: Database) {
  const query = db.from('brands_v2').select('id,slug,name,display_name,color,is_archived,is_umbrella,parent_brand_id,store_order', { count: 'exact' })
    .eq('tenant_id', scope.tenantId);
  const result = await query;
  if (result.error || !result.data || result.count !== result.data.length) throw new Error('Could not verify messaging brands.');
  const rows = result.data as BrandRow[];
  const ids = new Set(rows.map(row => row.id));
  if (rows.some(row => row.parent_brand_id && !ids.has(row.parent_brand_id))) throw new Error('Invalid messaging brand ownership.');
  // Stores are the data grain of an assigned umbrella brand, as in reporting.
  // No unrelated brand metadata is returned to the caller.
  if (scope.brandScope.kind === 'scoped') {
    const allowed = new Set(scope.brandScope.brandIds);
    return buildRegistry(rows.filter(row => allowed.has(row.id) || (row.parent_brand_id && allowed.has(row.parent_brand_id))));
  }
  return buildRegistry(rows);
}
