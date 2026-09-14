import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
function load(path, deps = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, Date, Intl, AbortSignal, console, require: name => { assert.ok(name in deps, name); return deps[name]; } });
  return exports;
}
const model = load('src/lib/data/creator-performance-history-model.ts');
assert.equal(model.historyDays('2024-02-28', '2024-03-01').length, 3);
for (const pair of [['2026-02-30', '2026-03-01'], ['bad', '2026-01-01'], ['2026-01-02', '2026-01-01'], ['2025-01-01', '2026-12-31']]) assert.equal(model.historyDays(...pair).length, 0);
const days = model.historyDays('2026-01-01', '2026-01-03');
const rows = days.map((stat_date, i) => ({ stat_date, gmv: i === 2 ? null : i === 0 ? '0' : '-2.25', posts: i === 2 ? null : i }));
const points = model.historyPoints(days, rows);
assert.equal(points[0].gmv, 0); assert.equal(points[1].gmv, -2.25); assert.equal(points[2].gmv, null);
const year = model.historyDays('2025-09-01', '2026-08-31');
const monthly = model.historyPoints(year, year.map(stat_date => ({ stat_date, gmv: stat_date === '2026-02-01' ? null : 1, posts: 1 })));
assert.equal(monthly.length, 12); assert.equal(monthly[0].gmv, 30); assert.equal(monthly[5].gmv, null); assert.equal(monthly[5].posts, 28);

let allowed = true, mode = 'normal', calls = 0, rpcCalls = 0;
const adapter = load('src/lib/data/creator-performance-history.ts', {
  'server-only': {}, './creator-performance-history-model': model,
  '@/lib/auth/creator-report-scope': { getCreatorReportBrands: async (creator, brand) => { assert.equal(creator, 'creator-a'); assert.equal(brand, 'alpha'); return allowed ? ['alpha'] : []; } },
  '@/lib/auth/workspace-scope': { getWorkspaceScope: async () => ({ tenantId: 'tenant-a' }) },
  '@/lib/supabase/server': { createAdminClient: async () => {
    calls++;
    return {
      from: table => {
        assert.equal(table, 'tiktok_accounts');
        const q = { select: () => q, limit: () => q, eq: (field, value) => { assert.equal(field, 'creator_id'); assert.equal(value, 'creator-a'); return q; },
          abortSignal: async () => ({ data: [{ tiktok_username: '@Case_Handle' }, { tiktok_username: 'case_handle' }], count: mode === 'handles' ? 3 : 2, error: null }) };
        return q;
      },
      rpc: (name, args) => {
        rpcCalls++; assert.equal(name, 'get_creator_performance_history');
        assert.equal(args.p_tenant_id, 'tenant-a'); assert.equal(String(args.p_brands), 'alpha'); assert.equal(String(args.p_handles), 'case_handle');
        assert.equal(args.p_start, days[0]); assert.equal(args.p_end, days[2]);
        return { abortSignal: async () => ({ data: mode === 'truncated' ? rows.slice(1) : mode === 'duplicate' ? [rows[0], rows[0], rows[2]] : rows, error: mode === 'error' ? {} : null }) };
      },
    };
  } },
});
const read = () => adapter.getCreatorPerformanceHistory('creator-a', days[0], days[2], 'alpha');
allowed = false; assert.equal((await read()).status, 'denied'); assert.equal(calls, 0);
assert.equal((await adapter.getCreatorPerformanceHistory('creator-a', 'bad', 'bad', 'alpha')).status, 'range'); assert.equal(calls, 0);
allowed = true; assert.equal((await read()).status, 'ready'); assert.equal(rpcCalls, 1);
for (mode of ['truncated', 'duplicate', 'error', 'handles']) { const value = await read(); assert.equal(value.status, 'unavailable', mode); assert.equal(value.points.length, 0); }
assert.equal(rpcCalls, 4, 'Incomplete handles must never reach RPC');
console.log('PASS range bounds, monthly grouping, missing versus zero, scoped RPC arguments, normalized handles, denied and truncated/error reads');
