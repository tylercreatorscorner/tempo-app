import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function load(path, deps) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => { assert.ok(name in deps, name); return deps[name]; } });
  return exports;
}
let reads = 0, failPage = false;
const rows = [
  { id: '1', tenant_id: 'tenant-a', creator_id: 'one', brand: 'alpha', retainer: 100, archived_at: null },
  { id: '2', tenant_id: 'tenant-a', creator_id: 'one', brand: 'alpha', retainer: 150, archived_at: null },
  { id: '3', tenant_id: 'tenant-a', creator_id: 'one', brand: 'beta', retainer: 200, archived_at: null },
  { id: '4', tenant_id: 'tenant-b', creator_id: 'other', brand: 'alpha', retainer: 9000, archived_at: null },
  { id: '5', tenant_id: 'tenant-a', creator_id: 'archived', brand: 'alpha', retainer: 5000, archived_at: '2026-01-01' },
  ...Array.from({ length: 1001 }, (_, i) => ({ id: `u${i}`, tenant_id: 'tenant-a', creator_id: null, brand: 'alpha', retainer: 1, archived_at: null })),
];
function from(table) {
  assert.equal(table, 'managed_creators');
  const filters = [];
  const q = {
    select: () => q, order: () => q,
    eq: (key, value) => { filters.push(r => r[key] === value); return q; },
    is: (key, value) => { filters.push(r => r[key] === value); return q; },
    in: (key, values) => { filters.push(r => values.includes(r[key])); return q; },
    range: async (start, end) => {
      reads++;
      if (failPage && start > 0) return { data: null, error: { message: 'read failed' } };
      return { data: rows.filter(r => filters.every(f => f(r))).slice(start, end + 1), error: null };
    },
  };
  return q;
}
const { getRosterSummaryRetainer } = load('src/lib/data/roster-summary-retainer.ts', {
  '@/lib/supabase/server': { createAdminClient: async () => ({ from }) },
  '@/lib/agreements/roster-terms': { applyRosterAgreementTerms: async rows => rows },
  './fetch-all-rows': load('src/lib/data/fetch-all-rows.ts', {}),
});
const owner = { tenantId: 'tenant-a', canViewCreatorCost: true, brandScope: { kind: 'all' } };
const manager = { ...owner, brandScope: { kind: 'scoped', brandSlugs: ['alpha'] } };
assert.equal(await getRosterSummaryRetainer(owner, 'all'), 1351, 'Deduplicate linked brand commitments; keep unlinked people and all pages');
assert.equal(await getRosterSummaryRetainer(owner, 'alpha'), 1151, 'Selected brand excludes other brands and tenants');
assert.equal(await getRosterSummaryRetainer(manager, null), 1151, 'Scoped all-brand view only includes assigned brands');
assert.equal(await getRosterSummaryRetainer(owner, 'empty'), 0, 'Empty brand is an actual zero');
const before = reads;
assert.equal(await getRosterSummaryRetainer(manager, 'beta'), null);
assert.equal(await getRosterSummaryRetainer({ ...owner, canViewCreatorCost: false }, null), null);
assert.equal(await getRosterSummaryRetainer({ ...manager, brandScope: { kind: 'scoped', brandSlugs: [] } }, null), null);
assert.equal(reads, before, 'Denied scopes never read creator costs');
failPage = true;
await assert.rejects(() => getRosterSummaryRetainer(owner, null), /read failed/, 'Never show a partial retainer total');
console.log('PASS roster summary: brand/tenant isolation, cost permission, duplicate agreements, 1000-row paging and failure propagation');
