import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import { isBrandInScope, type WorkspaceScope } from '@/lib/auth/workspace-scope';
import { can } from '@/lib/auth/permissions';
import { buildRegistry, expandSlugs, type BrandRow } from './brand-registry-core';
import { parsePublishedVideoEvidence } from './published-video-evidence';
import { rosterStudioAgreement, rosterStudioEmpty } from '@/lib/roster/studio-model';
import type { RosterStudioData, RosterStudioResponse } from '@/lib/roster/studio-types';

type Client = Awaited<ReturnType<typeof createAdminClient>>;
type ManagedRow = {
  id: number; brand: string; creator_id: string | null; retainer: number | string | null;
  monthly_post_requirement: number | null;
  account_1: string | null; account_2: string | null; account_3: string | null;
  account_4: string | null; account_5: string | null;
};
type Result = { status: 200; body: RosterStudioResponse } | { status: 403 | 500; body: { error: string } };
const normalize = (handle: string) => handle.trim().replace(/^@+/, '').toLowerCase();
const unavailable = (): Result => ({ status: 500, body: { error: 'Creator context is temporarily unavailable.' } });

function cachedAvatar(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)
      && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

async function loadAgreements(client: Client, scope: WorkspaceScope, rows: ManagedRow[], studios: Map<string, RosterStudioData>, asOf: string) {
  // This stable reader never calls ensureAgreementPeriods or another write path.
  let terms = new Map<string, unknown>();
  if (process.env.CREATOR_AGREEMENTS_ENABLED === 'true') {
    try {
      const { data, error } = await client.rpc('get_roster_agreement_terms', {
        p_tenant: scope.tenantId, p_ids: rows.map(row => row.id), p_as_of: asOf,
      }).abortSignal(AbortSignal.timeout(5_000));
      if (!error) terms = new Map((data ?? []).map((row: { managed_creator_id: number; agreement: unknown }) => [String(row.managed_creator_id), row.agreement]));
    } catch { /* Current terms remain explicitly unverified if the ledger cannot be read. */ }
  }
  for (const row of rows) studios.get(String(row.id))!.agreement = rosterStudioAgreement(terms.get(String(row.id)), row, asOf, scope.canViewCreatorCost);
}

async function loadOwners(client: Client, scope: WorkspaceScope, rows: ManagedRow[], brands: BrandRow[], studios: Map<string, RosterStudioData>) {
  try {
    const bySlug = new Map(brands.map(brand => [brand.slug, brand]));
    const brandIds = [...new Set(rows.map(row => bySlug.get(row.brand)?.id).filter((id): id is string => !!id))];
    const { data: assignments, error } = await client.from('brand_manager_assignments')
      .select('brand_id,manager_user_id').in('brand_id', brandIds).abortSignal(AbortSignal.timeout(5_000));
    if (error) return;
    const managerIds = [...new Set((assignments ?? []).map(row => row.manager_user_id as string))];
    const profiles = managerIds.length ? await client.from('user_profiles')
      .select('user_id,name,discord_avatar').eq('tenant_id', scope.tenantId).in('user_id', managerIds)
      .abortSignal(AbortSignal.timeout(5_000)) : { data: [], error: null };
    if (profiles.error) return;
    for (const row of rows) {
      const studio = studios.get(String(row.id))!;
      const brand = bySlug.get(row.brand);
      const matches = (assignments ?? []).filter(assignment => assignment.brand_id === brand?.id);
      // A conflicting assignment is not resolved arbitrarily to the first person.
      if (matches.length > 1) continue;
      const assignment = matches[0];
      if (!assignment) { studio.ownerStatus = 'unassigned'; continue; }
      const profile = profiles.data?.find(profile => profile.user_id === assignment.manager_user_id);
      if (!profile?.name?.trim()) continue;
      studio.owner = { id: profile.user_id, name: profile.name.trim(), avatar: cachedAvatar(profile.discord_avatar), role: 'Brand manager' };
      studio.ownerStatus = 'assigned';
    }
  } catch { /* Optional assignment failures must not hide the roster. */ }
}

async function loadPublications(client: Client, scope: WorkspaceScope, rows: ManagedRow[], brands: BrandRow[], studios: Map<string, RosterStudioData>, asOf: string) {
  const creatorIds = [...new Set(rows.map(row => row.creator_id).filter((id): id is string => !!id))];
  const handlesByCreator = new Map<string, string[]>();
  if (creatorIds.length) {
    try {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await client.from('tiktok_accounts').select('creator_id,tiktok_username')
          .eq('tenant_id', scope.tenantId).in('creator_id', creatorIds).order('id', { ascending: true })
          .range(from, from + 999).abortSignal(AbortSignal.timeout(5_000));
        if (error || from >= 5000) return;
        for (const account of data ?? []) {
          if (!account.tiktok_username) continue;
          const handles = handlesByCreator.get(account.creator_id) ?? [];
          handles.push(normalize(account.tiktok_username));
          handlesByCreator.set(account.creator_id, handles);
        }
        if (!data || data.length < 1000) break;
      }
    } catch { return; }
  }
  const registry = buildRegistry(brands);
  const handlesByRow = new Map(rows.map(row => {
    const linked = row.creator_id ? handlesByCreator.get(row.creator_id) : null;
    const fallback = [row.account_1, row.account_2, row.account_3, row.account_4, row.account_5].filter((handle): handle is string => !!handle).map(normalize);
    return [String(row.id), [...new Set(linked?.length ? linked : fallback)].filter(Boolean)];
  }));
  const groups = [...new Set(rows.map(row => row.brand))];
  const deadline = Date.now() + 20_000;
  let next = 0;
  async function worker() {
    while (next < groups.length) {
      if (Date.now() >= deadline) return;
      const brand = groups[next++];
      const groupRows = rows.filter(row => row.brand === brand);
      const handles = [...new Set(groupRows.flatMap(row => handlesByRow.get(String(row.id)) ?? []))];
      if (!handles.length) continue;
      const start = `${asOf.slice(0, 7)}-01`;
      try {
        // Explicit handles are page-scoped after tenant/brand authorization.
        // Bound both the brand fanout and each optional source read.
        const { data, error } = await client.rpc('get_report_published_video_evidence_workspace', {
          p_tenant_id: scope.tenantId, p_roster_slugs: [brand], p_data_slugs: expandSlugs(registry, brand),
          p_start: start, p_end: asOf, p_frozen_handles: handles,
        }).abortSignal(AbortSignal.timeout(5_000));
        if (error) continue;
        const evidence = parsePublishedVideoEvidence(data);
        if (evidence.periodStart !== start || evidence.periodEnd !== asOf
          || evidence.videos.some(video => video.qualifyingHandles.some(handle => !handles.includes(handle)))) continue;
        const idsByHandle = new Map<string, Set<string>>();
        for (const video of evidence.videos) for (const handle of video.qualifyingHandles) {
          const ids = idsByHandle.get(handle) ?? new Set<string>();
          ids.add(video.videoId);
          idsByHandle.set(handle, ids);
        }
        for (const row of groupRows) {
          const rowHandles = handlesByRow.get(String(row.id)) ?? [];
          if (!rowHandles.length) continue;
          const ids = new Set(rowHandles.flatMap(handle => [...(idsByHandle.get(handle) ?? [])]));
          const delivery = studios.get(String(row.id))!.delivery;
          delivery.published = ids.size;
          // Evidence membership aliases are not approved contract deliverables.
          delivery.reason = 'qualification_unverified';
        }
      } catch { /* Unavailable is null, never a fabricated zero. */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, groups.length) }, () => worker()));
}

/** Optional read-only enrichment, authorized independently of the primary roster request. */
export async function getRosterStudio(scope: WorkspaceScope, input: { ids: number[]; asOf: string }): Promise<Result> {
  if (!can(scope, 'roster', 'read')) return { status: 403, body: { error: 'Forbidden' } };
  try {
    const client = await createAdminClient();
    let query = client.from('managed_creators')
      .select('id,brand,creator_id,retainer,monthly_post_requirement,account_1,account_2,account_3,account_4,account_5')
      .eq('tenant_id', scope.tenantId).is('archived_at', null).in('id', input.ids);
    if (scope.brandScope.kind === 'scoped') query = query.in('brand', scope.brandScope.brandSlugs);
    const [{ data: records, error: rowError }, { data: brands, error: brandError }] = await Promise.all([
      query.abortSignal(AbortSignal.timeout(5_000)),
      client.from('brands_v2').select('id,slug,name,display_name,color,is_archived,is_umbrella,parent_brand_id,store_order')
        .eq('tenant_id', scope.tenantId).abortSignal(AbortSignal.timeout(5_000)),
    ]);
    if (rowError || brandError) return unavailable();
    const rows = (records ?? []) as ManagedRow[];
    const brandRows = (brands ?? []) as BrandRow[];
    const bySlug = new Map(brandRows.map(brand => [brand.slug, brand]));
    if (rows.length !== input.ids.length || rows.some(row => !bySlug.has(row.brand)
      || !isBrandInScope(scope, { slug: row.brand, id: bySlug.get(row.brand)?.id }))) {
      return { status: 403, body: { error: 'Creator context is outside your access.' } };
    }
    const studios = new Map(rows.map(row => [String(row.id), rosterStudioEmpty(input.asOf)]));
    await Promise.all([
      loadAgreements(client, scope, rows, studios, input.asOf),
      loadOwners(client, scope, rows, brandRows, studios),
      loadPublications(client, scope, rows, brandRows, studios, input.asOf),
    ]);
    return { status: 200, body: { asOf: input.asOf, rows: rows.map(row => ({ id: String(row.id), studio: studios.get(String(row.id))! })) } };
  } catch { return unavailable(); }
}
