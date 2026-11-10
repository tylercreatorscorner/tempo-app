import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const events = new Map(), requests = [], timers = new Set();
let activeHook;
const exports = {};
const source = readFileSync('src/hooks/use-brand-list.tsx', 'utf8');
assert.ok(!source.includes('createClient'), 'Brand choices must not make separate browser Supabase/profile reads');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
runInNewContext(code, {
  exports, AbortController, Set, console,
  window: { addEventListener: (name, listener) => { assert.equal(events.has(name), false, 'Only one shared workspace listener'); events.set(name, listener); } },
  setTimeout: callback => { timers.add(callback); return callback; }, clearTimeout: callback => timers.delete(callback),
  fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })),
  require: name => {
    assert.equal(name, 'react');
    return { useSyncExternalStore: (subscribe, getSnapshot, getServerSnapshot) => { activeHook.subscribe = subscribe; activeHook.getSnapshot = getSnapshot; activeHook.getServerSnapshot = getServerSnapshot; return getSnapshot(); } };
  },
});
function mount() {
  const hook = { notifications: 0 };
  activeHook = hook;
  hook.value = exports.useBrandList();
  hook.unmount = hook.subscribe(() => { hook.notifications++; hook.value = hook.getSnapshot(); });
  return hook;
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const row = (slug, overrides = {}) => ({ id: `id-${slug}`, slug, name: slug.toUpperCase(), display_name: null, color: null, is_archived: false, parent_brand_id: null, ...overrides });
async function resolve(index, brands, ok = true) { requests[index].resolve({ ok, json: async () => ({ brands, financeAvailable: false }) }); await flush(); }
const first = mount(), second = mount();
assert.equal(requests.length, 1, 'Simultaneous selectors share the scoped read');
assert.equal(requests[0].url, '/api/brands?metadata=1', 'Shared choices request metadata without optional billing dependencies');
assert.equal(requests[0].options.cache, 'no-store');
assert.equal(requests[0].options.credentials, 'same-origin');
assert.equal(first.value.loading, true);
await resolve(0, [row('alpha', { display_name: 'Alpha Display' }), row('child', { parent_brand_id: 'id-alpha' }), row('archived', { is_archived: true })]);
assert.equal(first.value.brands.length, 1);
assert.equal(first.value.loading, false, 'Successful metadata remains usable when optional finance is unavailable');
assert.equal(first.value.brands[0].name, 'Alpha Display');
assert.equal(first.value.brands[0].color, '#6B7280');
assert.equal(second.value, first.value, 'Every mounted subscriber gets the same authorized choices');
assert.equal(first.value.loading, false);
const cached = mount(); assert.equal(requests.length, 1); assert.equal(cached.value.brands[0].slug, 'alpha');

exports.invalidateBrandList();
assert.equal(requests.length, 2);
assert.equal(first.value.brands.length, 0, 'Invalidate clears old choices before refresh');
assert.equal(second.value.loading, true);
await resolve(1, [row('beta')]);
assert.equal(first.value.brands[0].slug, 'beta', 'Create/archive invalidation refreshes mounted selectors');
assert.equal(cached.value.brands[0].slug, 'beta');

exports.invalidateBrandList();
assert.equal(requests.length, 3);
events.get('workspace-context-changed')();
assert.equal(requests[2].options.signal.aborted, true);
assert.equal(requests.length, 4);
await resolve(3, [row('new-scope')]);
await resolve(2, [row('old-scope')]);
assert.equal(first.value.brands[0].slug, 'new-scope', 'Late old-scope response cannot refill cache or any subscriber');

events.get('workspace-context-changed')();
await resolve(4, [row('forbidden')], false);
assert.equal(first.value.brands.length, 0, 'Authorization failure clears old options');
assert.equal(first.value.loading, false);
const retry = mount(); assert.equal(requests.length, 6, 'A failed read is not cached as a successful empty list');
await resolve(5, []);
assert.equal(retry.value.loading, false); assert.equal(retry.value.brands.length, 0, 'Legitimate empty scope remains empty');

exports.invalidateBrandList();
requests[6].resolve({ ok: true, json: async () => ({ brands: [row('safe'), { slug: 'malformed' }] }) }); await flush();
assert.equal(first.value.brands.length, 0, 'Malformed results fail closed rather than pretending a partial list is complete');
assert.equal(first.value.loading, false);
exports.invalidateBrandList();
requests[7].reject(new Error('Network unavailable')); await flush();
assert.equal(first.value.loading, false); assert.equal(first.value.brands.length, 0);

for (const hook of [first, second, cached, retry]) hook.unmount();
const before = requests.length;
events.get('workspace-context-changed')();
assert.equal(requests.length, before, 'No background fetch when no selector is mounted');
const remounted = mount();
assert.equal(remounted.value.brands.length, 0); assert.equal(remounted.value.loading, true);
assert.equal(requests.length, before + 1, 'Workspace events invalidate cache even while all selectors are unmounted');
await resolve(before, [row('final')]);
assert.equal(remounted.value.brands[0].slug, 'final');
assert.equal(remounted.getServerSnapshot().brands.length, 0, 'SSR cannot reuse another request’s browser cache');
remounted.unmount();
assert.equal(timers.size, 0);
console.log('PASS brand list: canonical scoped API, active parent choices, shared subscribers, create/archive refresh, scope invalidation including unmounted state, late-response rejection, error/empty distinction and no fallback access');
