import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const creatorId = '9381d205-18d4-4d55-bea5-b6d2482ac7de';
const foreignId = '11111111-1111-4111-8111-111111111111';
let scope, allowed, creatorDenied, malformed, sourceFailure, evidenceFailure, adminReads;
const calls = [];
const contract = { id: 1, tenant_id: 'tenant', brand: 'alpha', creator_id: creatorId, archived_at: null, notes: 'Current brand note', tags: [' ELITE ', 'elite'], status: 'Active', retainer_start_date: '2026-08-01', reporting_start_date: null };
const fixtures = {
  tiktok_accounts: [{ tenant_id: 'tenant', creator_id: creatorId, tiktok_username: '@first' }],
  managed_creators: [contract, { ...contract, id: 2, creator_id: null, account_1: 'first' }, { ...contract, id: 3, creator_id: foreignId, account_1: 'first' }, { ...contract, id: 4, tenant_id: 'other' }, { ...contract, id: 5, brand: 'beta' }, { ...contract, id: 6, archived_at: '2026-09-01' }],
};
const client = {
  from(table) {
    const filters = []; let cap = Infinity, identity;
    const query = {
      select: () => query, eq: (key, value) => { filters.push(row => row[key] === value); calls.push(['filter', table, key, value]); return query; },
      is: (key, value) => { filters.push(row => row[key] === value); return query; },
      in: (key, values) => { filters.push(row => values.includes(row[key])); return query; },
      or: value => { identity = value; return query; }, order: () => query,
      limit: value => { cap = value; return query; },
      abortSignal: async () => {
        let rows = fixtures[table].map(row => ({ ...row }));
        if (table === 'tiktok_accounts' && malformed) rows[0].tiktok_username = 'bad),other.eq.secret';
        rows = rows.filter(row => filters.every(filter => filter(row)));
        if (identity) {
          assert.ok(identity.includes(`creator_id.eq.${creatorId}`));
          assert.ok(identity.includes('and(creator_id.is.null,or('), 'Legacy overlap cannot replace another linked identity');
          rows = rows.filter(row => row.creator_id === creatorId || row.creator_id === null && row.account_1 === 'first');
        }
        return { data: rows.slice(0, cap), count: rows.length, error: null };
      },
    };
    return query;
  },
};
const dependencies = {
  'server-only': {}, react: { cache: fn => fn },
  '@/lib/supabase/server': { createAdminClient: async () => { adminReads++; return client; } },
  '@/lib/auth/workspace-scope': { getWorkspaceScope: async () => scope },
  '@/lib/auth/authorize-creator': { authorizeCreator: async () => creatorDenied ? {} : null },
  '@/lib/auth/creator-report-scope': { getCreatorReportBrands: async (_id, brand) => brand === 'alpha' && allowed ? ['alpha'] : [] },
  '@/lib/auth/permissions': { can: () => allowed },
  '@/lib/roster/creator-tags': { normalizeCreatorTag: value => typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null },
  '@/lib/roster/studio-model': { rosterStudioDate: value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value },
  './roster-studio': { getRosterStudio: async (current, input) => {
    calls.push(['studio', input]);
    if (sourceFailure) return { status: 500 };
    assert.equal(input.ids.join(','), '1,2');
    assert.equal(input.asOf, '2026-10-20');
    return { status: 200, body: { rows: input.ids.map(id => ({ id: String(id), studio: { agreement: { source: 'ledger', retainer: current.canViewCreatorCost ? 300 : null }, delivery: { published: 3, qualifying: null, pace: null }, owner: { name: 'Actual manager', role: 'Brand manager' } } })) } };
  } },
  './published-video-evidence': { getPublishedVideoEvidence: async input => {
    calls.push(['evidence', input]);
    if (evidenceFailure) throw Error('Source unavailable');
    assert.equal(input.tenantId, 'tenant'); assert.equal(input.frozenHandles.join(','), 'first');
    assert.equal(input.rosterSlugs.join(','), 'alpha'); assert.equal(input.dataSlugs.join(','), 'alpha');
    return { capturedAt: '2026-10-20T12:00:00Z', videos: [{ videoId: '123', creatorHandle: 'first', qualifyingHandles: ['first'], publishedAt: '2026-10-04', watchUrl: 'https://www.tiktok.com/@first/video/123', title: 'Recorded publication without a sales requirement' }] };
  } },
};
const api = {};
runInNewContext(ts.transpileModule(readFileSync('src/lib/data/creator-profile-studio.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: api, Date, Map, Set, AbortSignal, Promise, require: name => { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; },
});
function reset() {
  scope = { tenantId: 'tenant', canViewCreatorCost: true, brandScope: { kind: 'scoped', brandSlugs: ['alpha'] } };
  allowed = true; creatorDenied = false; malformed = false; sourceFailure = false; evidenceFailure = false; adminReads = 0; calls.length = 0;
}
reset(); let result = await api.getCreatorStudioContracts(creatorId, '2026-10-20');
assert.equal(result.status, 'ready'); assert.equal(result.contracts.map(row => row.managedId).join(','), '1,2');
assert.equal(result.contracts[0].creatorTags.join(','), 'elite'); assert.equal(result.contracts[0].studio.owner.role, 'Brand manager');
assert.ok(calls.some(row => row[0] === 'filter' && row[1] === 'managed_creators' && row[2] === 'tenant_id' && row[3] === 'tenant'));
reset(); result = await api.getCreatorStudioContracts(creatorId, '2026-10-20', 'alpha'); assert.equal(result.status, 'ready'); assert.ok(calls.some(row => row[0] === 'filter' && row[1] === 'managed_creators' && row[2] === 'brand' && row[3] === 'alpha'));
reset(); result = await api.getCreatorStudioContracts(creatorId, '2026-10-20', 'beta'); assert.equal(result.status, 'denied'); assert.ok(!calls.some(row => row[0] === 'studio'));
reset(); scope.canViewCreatorCost = false; result = await api.getCreatorStudioContracts(creatorId, '2026-10-20');
assert.equal(result.contracts[0].studio.agreement.retainer, null); assert.equal('retainer' in result.contracts[0], false);
reset(); allowed = false; assert.equal((await api.getCreatorStudioContracts(creatorId, '2026-10-20')).status, 'denied'); assert.equal(adminReads, 0);
reset(); creatorDenied = true; assert.equal((await api.getCreatorStudioContracts(creatorId, '2026-10-20')).status, 'denied'); assert.equal(adminReads, 0);
reset(); malformed = true; assert.equal((await api.getCreatorStudioContracts(creatorId, '2026-10-20')).status, 'unavailable'); assert.ok(!calls.some(row => row[1] === 'managed_creators'));
reset(); sourceFailure = true; assert.equal((await api.getCreatorStudioContracts(creatorId, '2026-10-20')).status, 'unavailable');
reset(); assert.equal((await api.getCreatorStudioContracts(creatorId, '2026-02-30')).status, 'unavailable'); assert.equal(adminReads, 0);
reset(); result = await api.getCreatorPublicationEvidence(creatorId, 'alpha', '2026-10-01', '2026-10-20');
assert.equal(result.status, 'ready'); assert.equal(result.videos.length, 1); assert.equal(result.videos[0].thumbnailUrl, null);
assert.equal(result.videos[0].matchedHandles.join(','), 'first'); assert.equal('qualifying' in result.videos[0], false);
assert.equal(result.source.basis, 'recorded_publications');
reset(); assert.equal((await api.getCreatorPublicationEvidence(creatorId, 'beta', '2026-10-01', '2026-10-20')).status, 'denied'); assert.ok(!calls.some(row => row[0] === 'evidence'));
reset(); evidenceFailure = true; result = await api.getCreatorPublicationEvidence(creatorId, 'alpha', '2026-10-01', '2026-10-20'); assert.equal(result.status, 'unavailable'); assert.equal(result.source, null);
reset(); const accounts = fixtures.tiktok_accounts; fixtures.tiktok_accounts = []; result = await api.getCreatorPublicationEvidence(creatorId, 'alpha', '2026-10-01', '2026-10-20'); fixtures.tiktok_accounts = accounts; assert.equal(result.status, 'unavailable'); assert.ok(!calls.some(row => row[0] === 'evidence'), 'An unlinked identity is not a zero-publication claim');
assert.ok(!readFileSync('src/lib/data/creator-profile-studio.ts', 'utf8').match(/ensureAgreementPeriods|applyRosterAgreementTerms\(/));
console.log('PASS creator profile studio: tenant/brand and identity scope, selected-date read-only terms, nullable costs, current tags, publication links without sales/qualification claims, and unavailable sources');
