/**
 * Contest entrant resolution — who is IN a contest, resolved once at launch
 * and FROZEN into contest_entrants (mig 108: the cohort locks when the gun
 * goes off; a segment edited mid-contest must not change who competes).
 *
 * One entrant per HUMAN — the computeManagedGmv / roster identity idiom:
 * group by creators_v2 id when present (collecting every handle from
 * tiktok_accounts), handle-only rows fall back to the lowercased handle as
 * the key. Handles are stored lowercased/@-stripped so they join the mig 059
 * rollups directly.
 *
 * Scope resolution:
 *   'segment' → REPLAY the segment's SegmentFilterCriteria through
 *               runRosterQuery, exactly like the Comms hub's resolveAudience
 *               (no reimplementation of criteria evaluation).
 *   'brand'   → managed_creators for the brand's data stores, umbrella-safe
 *               on BOTH sides via expandSlugs (never a raw umbrella slug
 *               against store-grain data).
 *   'all'     → every non-archived managed creator.
 */
import { createAdminClient } from '@/lib/supabase/server';
import { getBrandRegistry, expandSlugs } from '@/lib/data/brand-registry';
import { runRosterQuery, type EnrichedRow } from '@/lib/data/roster-query';
import { criteriaToRosterParams, type SegmentFilterCriteria } from '@/lib/data/segments';
import { fetchAllRows } from '@/lib/data/fetch-all-rows';
import { normalizeHandle } from '@/lib/data/managed-gmv';
import type { WorkspaceScope } from '@/lib/auth/workspace-scope';
import { chunkList } from './server';

export interface ResolvedEntrant {
  creator_id: string | null;
  display_name: string | null;
  handles: string[];
}

/** Resolution failure carrying its HTTP status (the AudienceError pattern). */
export class EntrantResolveError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'EntrantResolveError';
    this.status = status;
  }
}

interface EntrantSource {
  creatorId: string | null;
  handles: string[];
  displayName: string | null;
}

/**
 * Group raw rows to one entrant per human. Two passes: creator_id rows claim
 * their handles first; handle-only rows then MERGE into the claiming person
 * when their handle is already taken (a person must never appear — and score —
 * twice), else key on their first handle.
 */
function groupEntrants(rows: EntrantSource[]): ResolvedEntrant[] {
  const groups = new Map<
    string,
    { creator_id: string | null; display_name: string | null; handles: Set<string> }
  >();
  const keyByHandle = new Map<string, string>();

  const put = (key: string, creatorId: string | null, r: EntrantSource) => {
    const g =
      groups.get(key) ?? { creator_id: creatorId, display_name: null, handles: new Set<string>() };
    if (!g.display_name && r.displayName) g.display_name = r.displayName;
    for (const h of r.handles) {
      g.handles.add(h);
      if (!keyByHandle.has(h)) keyByHandle.set(h, key);
    }
    groups.set(key, g);
  };

  for (const r of rows) {
    if (r.creatorId) put(r.creatorId, r.creatorId, r);
  }
  for (const r of rows) {
    if (r.creatorId) continue;
    const claimed = r.handles.map((h) => keyByHandle.get(h)).find((k): k is string => !!k);
    const key = claimed ?? (r.handles[0] ? `h:${r.handles[0]}` : null);
    if (!key) continue; // no identity link and no handle — nothing to freeze
    put(key, groups.get(key)?.creator_id ?? null, r);
  }

  return Array.from(groups.values()).map((g) => ({
    creator_id: g.creator_id,
    display_name: g.display_name,
    handles: Array.from(g.handles),
  }));
}

function rowHandles(handles: string[] | null | undefined, legacy: Array<string | null>): string[] {
  const canonical = (handles ?? []).map(normalizeHandle).filter(Boolean);
  if (canonical.length > 0) return Array.from(new Set(canonical));
  return Array.from(new Set(legacy.map(normalizeHandle).filter(Boolean)));
}

async function resolveSegmentEntrants(
  scope: WorkspaceScope,
  segmentId: string,
): Promise<{ entrants: ResolvedEntrant[]; criteria: SegmentFilterCriteria }> {
  const admin = await createAdminClient();
  const { data: seg, error: segErr } = await admin
    .from('segments')
    .select('id, filter_criteria')
    .eq('id', segmentId)
    .eq('tenant_id', scope.tenantId)
    .maybeSingle();
  if (segErr) throw new EntrantResolveError(segErr.message, 500);
  if (!seg) throw new EntrantResolveError('Segment not found', 404);
  const criteria =
    ((seg as { filter_criteria: SegmentFilterCriteria | null }).filter_criteria ?? {}) as SegmentFilterCriteria;

  // Replay through the roster core (export mode, no KPI block) — the same
  // resolution path the Comms hub uses; there is exactly one evaluator of
  // SegmentFilterCriteria in this codebase.
  const params = criteriaToRosterParams(criteria);
  params.set('all', '1');
  params.set('summary', '0');
  const result = await runRosterQuery(scope, params);
  if (result.status !== 200) throw new EntrantResolveError(result.body.error, result.status);

  const sources: EntrantSource[] = result.body.data.map((r: EnrichedRow) => ({
    creatorId: r.creator_id,
    handles: rowHandles(r.handles, [r.account_1, r.account_2, r.account_3, r.account_4, r.account_5]),
    displayName: r.real_name,
  }));
  return { entrants: groupEntrants(sources), criteria };
}

interface ManagedLite {
  id: string | number;
  real_name: string | null;
  brand: string | null;
  creator_id: string | null;
  account_1: string | null;
  account_2: string | null;
  account_3: string | null;
  account_4: string | null;
  account_5: string | null;
}

async function resolveManagedEntrants(brandSlug: string | null): Promise<ResolvedEntrant[]> {
  const admin = await createAdminClient();
  const reg = await getBrandRegistry();

  // Paged past the 1000-row cap — an un-paged read silently drops entrants.
  const managedRows = await fetchAllRows<ManagedLite>(
    () =>
      admin
        .from('managed_creators')
        .select('id, real_name, brand, creator_id, account_1, account_2, account_3, account_4, account_5')
        .is('archived_at', null)
        .order('id', { ascending: true }),
    'contest-entrants',
  );

  let rows = managedRows;
  if (brandSlug) {
    // Umbrella-safe on BOTH sides: the contest's brand and each row's brand
    // expand to data-store slugs; a row is in scope when the sets intersect
    // (a creator managed under the umbrella competes in a store contest and
    // vice versa).
    const target = new Set(expandSlugs(reg, brandSlug));
    rows = managedRows.filter(
      (m) => !!m.brand && expandSlugs(reg, m.brand).some((s) => target.has(s)),
    );
  }

  // Canonical handles from tiktok_accounts (chunked ≤500 + paged), legacy
  // account_1..5 as the fallback for unlinked rows — buildManagedLookup's idiom.
  const creatorIds = Array.from(
    new Set(rows.map((m) => m.creator_id).filter((v): v is string => !!v)),
  );
  const handlesByCreator = new Map<string, string[]>();
  const batchResults = await Promise.all(
    chunkList(creatorIds, 500).map((batch) =>
      fetchAllRows<{ creator_id: string; tiktok_username: string | null }>(
        () =>
          admin
            .from('tiktok_accounts')
            .select('creator_id, tiktok_username')
            .in('creator_id', batch)
            .order('id', { ascending: true }),
        'contest-entrants',
      ),
    ),
  );
  for (const taRows of batchResults) {
    for (const t of taRows) {
      const h = normalizeHandle(t.tiktok_username);
      if (!h) continue;
      const list = handlesByCreator.get(t.creator_id) ?? [];
      if (!list.includes(h)) list.push(h);
      handlesByCreator.set(t.creator_id, list);
    }
  }

  const sources: EntrantSource[] = rows.map((m) => ({
    creatorId: m.creator_id,
    handles: rowHandles(m.creator_id ? handlesByCreator.get(m.creator_id) : null, [
      m.account_1,
      m.account_2,
      m.account_3,
      m.account_4,
      m.account_5,
    ]),
    displayName: m.real_name,
  }));
  return groupEntrants(sources);
}

/**
 * Resolve the entrant cohort for a contest at launch. Returns the criteria
 * snapshot for segment contests (frozen onto the contest row for provenance);
 * null for brand/all.
 */
export async function resolveContestEntrants(
  scope: WorkspaceScope,
  contest: { scope_kind: 'brand' | 'segment' | 'all'; brand_slug: string | null; segment_id: string | null },
): Promise<{ entrants: ResolvedEntrant[]; criteria: SegmentFilterCriteria | null }> {
  if (contest.scope_kind === 'segment') {
    if (!contest.segment_id) throw new EntrantResolveError('Contest has no segment_id', 400);
    return resolveSegmentEntrants(scope, contest.segment_id);
  }
  if (contest.scope_kind === 'brand') {
    if (!contest.brand_slug) throw new EntrantResolveError('Contest has no brand_slug', 400);
    return { entrants: await resolveManagedEntrants(contest.brand_slug), criteria: null };
  }
  return { entrants: await resolveManagedEntrants(null), criteria: null };
}
