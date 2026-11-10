import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = path => readFileSync(path, 'utf8');
function moduleAt(path, dependencies = {}) {
  const api = {};
  runInNewContext(ts.transpileModule(source(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: api, require: name => { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; },
    URL, URLSearchParams, Date, Map, Set, AbortSignal, Promise, process: { env: { CREATOR_AGREEMENTS_ENABLED: 'true' } },
  });
  return api;
}
const model = moduleAt('src/lib/roster/studio-model.ts');
const registry = moduleAt('src/lib/data/brand-registry-core.ts');
const asOf = '2026-10-20';
assert.equal(model.parseRosterStudioQuery(new URLSearchParams('ids=1&asOf=2026-02-30'), asOf), null);
assert.equal(model.parseRosterStudioQuery(new URLSearchParams('ids=1&asOf=2026-10-21'), asOf), null);
assert.equal(model.parseRosterStudioQuery(new URLSearchParams('ids=1,0'), asOf), null);
assert.equal(model.parseRosterStudioQuery(new URLSearchParams('ids=2147483648'), asOf), null);
assert.equal(model.parseRosterStudioQuery(new URLSearchParams(`ids=${Array(101).fill('1').join(',')}`), asOf), null);
assert.equal(model.parseRosterStudioQuery(new URLSearchParams('ids=1,1,2'), asOf).ids.join(','), '1,2');

const calls = [];
let deniedTables = new Set(), deniedRpcs = new Set();
const fullMonth = { retainer: 300, quota: 30, status: 'active', periodStart: '2026-10-01', periodEnd: '2026-10-31', snapshot: { segments: [{ from: '2026-10-01', through: '2026-10-31' }] } };
const fixture = {
  managed_creators: [
    { id: 1, tenant_id: 'tenant', brand: 'alpha', creator_id: 'creator-a', retainer: 999, monthly_post_requirement: 99, archived_at: null, account_1: 'outdated' },
    { id: 2, tenant_id: 'tenant', brand: 'beta', creator_id: 'creator-a', retainer: 500, monthly_post_requirement: 20, archived_at: null },
    { id: 3, tenant_id: 'other', brand: 'alpha', creator_id: 'creator-other', retainer: 1000, archived_at: null },
  ],
  brands_v2: [
    { id: 'brand-alpha', tenant_id: 'tenant', slug: 'alpha', is_umbrella: false },
    { id: 'brand-beta', tenant_id: 'tenant', slug: 'beta', is_umbrella: false },
    { id: 'brand-other', tenant_id: 'other', slug: 'other', is_umbrella: false },
  ],
  tiktok_accounts: [
    { id: 1, tenant_id: 'tenant', creator_id: 'creator-a', tiktok_username: '@shared' },
    { id: 2, tenant_id: 'tenant', creator_id: 'creator-a', tiktok_username: 'second' },
    { id: 3, tenant_id: 'other', creator_id: 'creator-a', tiktok_username: 'private-other' },
  ],
  brand_manager_assignments: [{ brand_id: 'brand-alpha', manager_user_id: 'manager' }, { brand_id: 'brand-beta', manager_user_id: 'other-manager' }],
  user_profiles: [{ tenant_id: 'tenant', user_id: 'manager', name: 'Hunter', discord_avatar: 'https://cdn.discordapp.com/avatars/id/hash.png' },
    { tenant_id: 'other', user_id: 'other-manager', name: 'Private identity' }],
};
const video = (id, aliases) => ({ videoId: id, creatorHandle: aliases[0], qualifyingHandles: aliases, publishedAt: '2026-10-12', watchUrl: null, title: null });
let agreements = [{ managed_creator_id: 1, agreement: fullMonth }, { managed_creator_id: 2, agreement: null }];
const client = {
  from(table) {
    calls.push({ table });
    const filters = [];
    let lower = 0, upper = Infinity;
    const query = {
      select: () => query,
      eq: (key, value) => { filters.push(row => row[key] === value); return query; },
      is: (key, value) => { filters.push(row => row[key] === value); return query; },
      in: (key, values) => { filters.push(row => values.includes(row[key])); return query; },
      order: () => query,
      range: (start, end) => { lower = start; upper = end; return query; },
      abortSignal: () => query,
      then(resolve, reject) { return Promise.resolve(deniedTables.has(table) ? { data: null, error: new Error('Unavailable') }
        : { data: fixture[table].filter(row => filters.every(filter => filter(row))).slice(lower, upper + 1), error: null }).then(resolve, reject); },
    };
    return query;
  },
  rpc(name, args) {
    calls.push({ rpc: name, args });
    return { abortSignal: async () => {
      if (deniedRpcs.has(name)) return { data: null, error: new Error('Unavailable') };
      if (name === 'get_roster_agreement_terms') return { data: agreements, error: null };
      assert.equal(name, 'get_report_published_video_evidence_workspace');
      assert.equal(args.p_tenant_id, 'tenant');
      assert.equal(args.p_start, '2026-10-01');
      assert.equal(args.p_end, asOf);
      assert.ok(!args.p_frozen_handles.includes('private-other'), 'Tenant-bound aliases only');
      const videos = args.p_data_slugs.includes('alpha') ? [video('11', ['shared', 'second']), video('12', ['second'])] : [video('13', ['shared'])];
      return { error: null, data: { v: 1, capturedAt: '2026-10-20T12:00:00Z', periodStart: args.p_start, periodEnd: args.p_end, scope: 'managed-published', total: videos.length, videos } };
    } };
  },
};
const evidence = moduleAt('src/lib/data/published-video-evidence.ts', { 'server-only': {}, '@/lib/supabase/server': { createAdminClient: async () => client } });
const adapter = moduleAt('src/lib/data/roster-studio.ts', {
  'server-only': {}, '@/lib/supabase/server': { createAdminClient: async () => client },
  '@/lib/auth/workspace-scope': { isBrandInScope: (scope, brand) => scope.brandScope.kind === 'all' || scope.brandScope.brandSlugs.includes(brand.slug) },
  '@/lib/auth/permissions': { can: scope => scope.permissions?.has('roster:read') === true },
  './brand-registry-core': registry, './published-video-evidence': evidence, '@/lib/roster/studio-model': model,
});
const scope = { tenantId: 'tenant', permissions: new Set(['roster:read']), canViewCreatorCost: true, brandScope: { kind: 'all' } };
let result = await adapter.getRosterStudio(scope, { ids: [1, 2], asOf });
assert.equal(result.status, 200);
const first = result.body.rows.find(row => row.id === '1').studio;
const second = result.body.rows.find(row => row.id === '2').studio;
assert.equal(first.delivery.published, 2, 'Deduplicate a video matching multiple handles');
assert.equal(second.delivery.published, 1, 'Keep per-brand monthly publication evidence separate');
assert.equal(first.delivery.qualifying, null);
assert.equal(first.delivery.pace, null, 'Do not invent agreement approval or pace');
assert.equal(first.delivery.reason, 'qualification_unverified');
assert.equal(first.agreement.retainer, 300, 'Use historical ledger over current 999');
assert.equal(first.agreement.requiredPosts, 30);
assert.equal(first.agreement.comparable, true);
assert.equal(second.agreement.source, 'current');
assert.equal(second.agreement.status, 'unverified', 'Legacy current terms are not confirmed historical terms');
assert.equal(second.agreement.periodStart, null);
assert.equal(first.owner.name, 'Hunter');
assert.equal(first.owner.role, 'Brand manager');
assert.equal(second.owner, null, 'Never expose a profile from another tenant');
assert.equal(second.ownerStatus, 'unavailable');
assert.equal(calls.filter(call => call.rpc === 'get_roster_agreement_terms').length, 1, 'One batched stable ledger read');
assert.equal(calls.filter(call => call.rpc === 'get_report_published_video_evidence_workspace').length, 2, 'One publication read per brand, not per creator');

calls.length = 0;
result = await adapter.getRosterStudio({ ...scope, brandScope: { kind: 'scoped', brandSlugs: ['alpha'] } }, { ids: [1, 2], asOf });
assert.equal(result.status, 403);
assert.equal(calls.some(call => call.rpc), false, 'Reauthorize every row before enrichment');
calls.length = 0;
assert.equal((await adapter.getRosterStudio(scope, { ids: [3], asOf })).status, 403);
assert.equal(calls.some(call => call.rpc), false, 'Other-tenant ID never reaches enrichment');
calls.length = 0;
assert.equal((await adapter.getRosterStudio({ ...scope, permissions: undefined }, { ids: [1], asOf })).status, 403);
assert.equal(calls.length, 0, 'Unresolved permissions fail before privileged reads');

result = await adapter.getRosterStudio({ ...scope, canViewCreatorCost: false }, { ids: [1, 2], asOf });
assert.ok(result.body.rows.every(row => row.studio.agreement.retainer === null), 'Scrub both ledger and legacy dollars');
deniedRpcs = new Set(['get_roster_agreement_terms', 'get_report_published_video_evidence_workspace']);
result = await adapter.getRosterStudio(scope, { ids: [1], asOf });
assert.equal(result.status, 200);
assert.equal(result.body.rows[0].studio.delivery.published, null, 'Failed evidence is unknown, never zero');
assert.equal(result.body.rows[0].studio.agreement.source, 'current');
assert.equal(result.body.rows[0].studio.agreement.comparable, false);
deniedRpcs = new Set();
deniedTables = new Set(['tiktok_accounts']);
result = await adapter.getRosterStudio(scope, { ids: [1], asOf });
assert.equal(result.body.rows[0].studio.delivery.published, null, 'Failed identity reads never fall back to a potentially wrong count');
deniedTables = new Set();

const changed = model.rosterStudioAgreement({ ...fullMonth, snapshot: { segments: [{ from: '2026-10-01', through: '2026-10-04' }, { from: '2026-10-05', through: '2026-10-31' }] } }, {}, asOf, true);
assert.equal(changed.comparable, false, 'Mid-month revisions are not a simple full-month target');
assert.equal(model.rosterStudioAgreement({ ...fullMonth, retainer: 0, quota: null }, {}, asOf, true).status, 'active', 'Zero fee does not establish Affiliate partnership type');
const adapterSource = source('src/lib/data/roster-studio.ts');
assert.doesNotMatch(adapterSource, /\.insert\(|\.update\(|\.upsert\(|ensureAgreementPeriods\(/, 'Read-only optional context must never create renewals');
console.log('PASS roster studio: historical sources, current-term labeling, tenant/brand authorization, batched reads, publication identity deduplication, privacy, failures and no inferred qualifying pace');
