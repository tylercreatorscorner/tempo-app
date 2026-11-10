import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const classes = new Proxy({}, { get: (_, name) => String(name) });
const nil = () => null;
const dependencies = { react: React, 'react/jsx-runtime': jsx };
let fetchImpl;
const listeners = new Map();
const window = { addEventListener: (name, listener) => listeners.set(name, listener), removeEventListener: (name, listener) => { if (listeners.get(name) === listener) listeners.delete(name); } };
function load(file, extra = '') {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8') + extra, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  runInNewContext(code, { exports, Intl, Number, Date, URL, URLSearchParams, Set, Map, AbortController, setTimeout, clearTimeout, console: { ...console, error() {} }, window, fetch: (...args) => fetchImpl(...args), require: name => name.endsWith('.css') ? { default: classes, __esModule: true } : dependencies[name] ?? new Proxy({}, { get: (_, key) => key === '__esModule' ? true : nil }) });
  return exports;
}
const { RosterStats } = load('src/components/roster/RosterStats.tsx');
const props = { retainerBudget: 12500, managedGmv: 84000, videosPublished: 241, retainerComplete: true, retainerMissingCount: 0, gmvComplete: true, videosComplete: true, brandLabel: 'All brands', periodLabel: 'Nov 3 – Nov 9' };
const html = override => renderToStaticMarkup(React.createElement(RosterStats, { ...props, ...override }));
let rendered = html({});
for (const label of ['Retainer budget', 'Current recorded monthly commitments', 'Managed GMV', 'Videos published', '$12,500', '$84,000', '241']) assert.ok(rendered.includes(label), label);
assert.equal((rendered.match(/<dt>/g) ?? []).length, 3);
assert.ok(!rendered.includes('Partial recorded'));
rendered = html({ retainerBudget: 0, managedGmv: 0, videosPublished: 0 });
assert.equal((rendered.match(/\$0</g) ?? []).length, 2, 'Known complete zero remains a real currency value');
assert.ok(rendered.includes('>0</dd>'));
rendered = html({ retainerBudget: null, managedGmv: null, videosPublished: null });
assert.equal((rendered.match(/>Unavailable</g) ?? []).length, 3, 'Permission/read failures stay unavailable');
assert.ok(!rendered.includes('$0'));
rendered = html({ gmvComplete: false, videosComplete: false, retainerComplete: false, retainerMissingCount: 2 });
assert.equal((rendered.match(/Partial recorded data/g) ?? []).length, 2);
assert.ok(rendered.includes('Partial recorded terms'));
assert.ok(rendered.includes('excludes 2 creators without a recorded rate'));
assert.ok(rendered.includes('$84,000'), 'Known recorded subtotal remains visible with partial label');
rendered = html({ loading: true, gmvComplete: false, videosComplete: false });
assert.equal((rendered.match(/>Loading…</g) ?? []).length, 3);
assert.ok(!rendered.includes('$84,000') && !rendered.includes('Partial recorded'));
assert.ok(html({ stale: true }).includes('Last loaded totals · refresh failed'));
assert.ok(html({ refreshing: true }).includes('Updating totals…'));

// Exercise the actual page's fetching and scope controls with a small hook runtime.
let hook, query = new URLSearchParams('brand=northstar&range=last7&keep=yes');
const stableBrands = [{ slug: 'northstar', name: 'Northstar Beauty' }, { slug: 'evergreen', name: 'Evergreen Wellness' }];
const brandMeta = { label: slug => stableBrands.find(brand => brand.slug === slug)?.name ?? slug };
const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const memo = (fn, deps) => { const index = hook.memoIndex++; const prior = hook.memos[index]; if (prior && same(prior.deps, deps)) return prior.value; const value = fn(); hook.memos[index] = { value, deps }; return value; };
dependencies.react = {
  ...React,
  useState: initial => { const index = hook.stateIndex++; if (!(index in hook.states)) hook.states[index] = typeof initial === 'function' ? initial() : initial; return [hook.states[index], next => { const value = typeof next === 'function' ? next(hook.states[index]) : next; if (!Object.is(value, hook.states[index])) { hook.states[index] = value; hook.dirty = true; } }]; },
  useRef: initial => { const index = hook.refIndex++; return hook.refs[index] ??= { current: initial }; },
  useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps), useId: () => 'fixture',
  useEffect: (fn, deps) => { const index = hook.effectIndex++; const previous = hook.effects[index]; if (!previous || !same(previous.deps, deps)) hook.pending.push(() => { previous?.cleanup?.(); hook.effects[index] = { deps, cleanup: fn() }; }); },
};
Object.assign(dependencies, {
  'next/navigation': { useSearchParams: () => query, useRouter: () => ({ push: href => { query = new URL(href, 'https://fixture.invalid').searchParams; hook.dirty = true; } }) },
  'radix-ui': Object.fromEntries(['DropdownMenu', 'Popover'].map(name => [name, new Proxy({}, { get: (_, key) => `${name}.${String(key)}` })])),
  '@/hooks/use-brand-list': { useBrandList: () => ({ brands: stableBrands, loading: false }) },
  '@/hooks/use-brand-meta': { useBrandMeta: () => brandMeta },
  '@/hooks/use-delayed-flag': { useDelayedFlag: value => value },
  '@/components/layout/navigation-pending': { useNavigationPending: () => ({ startNav: fn => fn() }) },
  '@/lib/data/date-utils': { DATE_PRESETS: [{ value: 'last7', label: 'Last 7 Days' }, { value: 'last30', label: 'Last 30 Days' }] },
  '@/components/roster/RosterStats': { RosterStats: 'RosterStats' },
  '@/components/ui/choice-menu': { ChoiceMenu: 'ChoiceMenu' },
  '@/components/dashboard/date-range-picker': { DateRangePicker: 'DateRangePicker' },
  '@/components/roster/studio-roster-table': { StudioRosterTable: 'StudioRosterTable' },
});
dependencies['@/lib/latest-request'] = load('src/lib/latest-request.ts');
const { Page } = load('src/app/(admin)/roster/page.tsx', '\nexport { RosterContent as Page };');
const state = { states: [], refs: [], memos: [], effects: [], pending: [], dirty: true };
let tree;
function render() {
  hook = state; Object.assign(state, { stateIndex: 0, refIndex: 0, memoIndex: 0, effectIndex: 0, dirty: false });
  tree = Page();
  const pending = state.pending.splice(0); pending.forEach(effect => effect());
  return tree;
}
const flush = () => new Promise(resolve => setImmediate(resolve));
async function settle() { for (let i = 0; i < 8; i++) { if (state.dirty) render(); await flush(); } }
function nodes(root) { if (root == null || typeof root !== 'object') return []; if (Array.isArray(root)) return root.flatMap(nodes); return [root, ...nodes(root.props?.children)]; }
const find = predicate => { const node = nodes(tree).find(predicate); assert.ok(node, 'Expected control'); return node; };
const stats = () => find(node => node.type === 'RosterStats').props;
const result = (gmv = 64000, budget = 9000, videos = 169) => ({ data: [], total: 0, period: { start: '2026-11-03', end: '2026-11-09' }, total_gmv_period: gmv, summary: { total_retainer: budget, retainer_complete: true, retainer_missing_count: 0, videos_published: videos, affiliate_gmv: gmv == null ? null : gmv * 2, gmv_complete: true, videos_complete: true } });
let requests = [];
fetchImpl = async url => { requests.push(url); return { ok: true, json: async () => result() }; };
render(); assert.equal(stats().loading, true); assert.equal(stats().managedGmv, null);
await settle(); assert.equal(stats().managedGmv, 64000);
assert.equal(stats().brandLabel, 'Northstar Beauty');
assert.ok(nodes(tree).some(node => node.props?.className === 'scopeToolbar'), 'Scope is a visible section outside collapsed performance details');
let release;
fetchImpl = async url => { requests.push(url); await new Promise(resolve => { release = resolve; }); return { ok: true, json: async () => result(20000, 3500, 72) }; };
find(node => node.type === 'ChoiceMenu' && node.props.label === 'Brand').props.onChange('evergreen');
await settle();
assert.equal(query.get('keep'), 'yes'); assert.equal(query.get('range'), 'last7');
assert.equal(stats().managedGmv, null, 'Previous brand values cannot appear under the new selection');
assert.equal(stats().loading, true);
release(); await settle(); assert.equal(stats().managedGmv, 20000); assert.equal(stats().retainerBudget, 3500);
fetchImpl = async () => ({ ok: true, json: async () => result(null, 3500, null) });
find(node => node.type === 'button' && node.props['aria-label'] === 'Refresh creators').props.onClick();
await settle(); assert.equal(stats().managedGmv, null, 'Explicit unavailable refresh replaces old successful GMV');
assert.equal(stats().videosPublished, null); assert.equal(stats().retainerBudget, 3500);
fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({ error: 'Fixture failed' }) });
find(node => node.type === 'button' && node.props['aria-label'] === 'Refresh creators').props.onClick();
await settle(); assert.equal(stats().stale, true, 'Warm failed refresh labels retained same-scope values');
assert.ok(requests.some(url => url.includes('brand=evergreen')));
fetchImpl = async url => {
  requests.push(url);
  const params = new URL(url, 'https://fixture.invalid').searchParams;
  const response = { ...result(), data: [{ id: 'fixture-one', is_managed: true, handles: [] }], total: 101 };
  if (params.get('page') !== '1' || params.get('summary') === '0') { delete response.summary; delete response.total_gmv_period; }
  return { ok: true, json: async () => response };
};
find(node => node.type === 'button' && node.props['aria-label'] === 'Refresh creators').props.onClick();
await settle();
find(node => node.type === 'StudioRosterTable').props.onPage(2);
await settle();
assert.equal(find(node => node.type === 'StudioRosterTable').props.page, 2);
assert.equal(stats().managedGmv, 64000, 'Pagination preserves same-scope summary when API deliberately omits it');
listeners.get('workspace-context-changed')();
await settle();
assert.equal(find(node => node.type === 'StudioRosterTable').props.page, 1);
assert.equal(stats().managedGmv, 64000);
assert.equal(stats().loading, false, 'Workspace change from page two must resolve page-one summary');
assert.ok(requests.at(-1).includes('page=1'));
for (const effect of state.effects) effect?.cleanup?.();
console.log('PASS roster header: real component zero/null/partial/loading/stale rendering; actual page brand handoff, query preservation, stale-scope hiding and unavailable refresh replacement');
