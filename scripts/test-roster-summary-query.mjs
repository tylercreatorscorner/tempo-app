import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const exports = {};
let releaseLookup;
const lookupGate = new Promise(resolve => { releaseLookup = resolve; });
const started = [];
const dependencies = {
  '@/lib/data/roster-summary-retainer': { getRosterSummaryRetainer: async () => 450 },
  '@/lib/data/brand-registry': {
    resolveUuids: () => null,
    expandSlugs: (_reg, slug) => [slug],
  },
  '@/lib/data/rpc': {
    getAnalyticsBrandTotals: async (_ids, start) => {
      started.push(`affiliate:${start}`);
      return [{ total_gmv: start === '2026-08-01' ? 1200 : 900 }];
    },
  },
  '@/lib/data/managed-gmv': {
    buildManagedLookup: async () => {
      started.push('lookup');
      await lookupGate;
      return { shared: true };
    },
    computeManagedGmv: async (start, _end, _slugs, _reg, lookup) => {
      assert.equal(lookup.shared, true);
      started.push(`managed:${start}`);
      const amount = start === '2026-08-01' ? 500 : start === '2026-07-01' ? 400 : 300;
      return { byStore: new Map([['alpha', amount]]) };
    },
    sumManagedGmvForBrands: result => result.byStore.get('alpha') ?? 0,
  },
};
const compiled = ts.transpileModule(readFileSync('src/lib/data/roster-summary.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
runInNewContext(compiled.outputText, {
  exports,
  require: name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  },
});

const input = {
  scope: { brandScope: { kind: 'all' } },
  brand: 'all',
  storeFilter: null,
  pStartDate: '2026-08-01',
  pEndDate: '2026-08-31',
  periodDays: 30,
  reg: { rows: [{ id: 'alpha-id', slug: 'alpha', parent_brand_id: null, is_archived: false }], bySlug: new Map([['alpha', { id: 'alpha-id' }]]) },
};
const task = exports.loadRosterSummary(input);
assert.ok(started.includes('lookup'));
assert.ok(started.includes('affiliate:2026-08-01'));
assert.ok(started.includes('affiliate:2026-07-01'));
releaseLookup();
const result = await task;
assert.equal(result.totalGmvPeriod, 500);
assert.deepEqual(JSON.parse(JSON.stringify(result.summary)), {
  affiliate_gmv: 1200,
  affiliate_gmv_prev: 900,
  managed_gmv_prev: 400,
  managed_gmv_30d: 300,
  total_retainer: 450,
});
console.log('PASS roster summary: all-brand financial values and independent reads overlap the managed lookup');
