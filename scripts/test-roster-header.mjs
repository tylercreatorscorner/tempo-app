import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as dateFns from 'date-fns';
import * as dateFnsTz from 'date-fns-tz';
import ts from 'typescript';

const classes = new Proxy({}, { get: (_, name) => String(name) });
const nil = () => null;
const dependencies = { react: React, 'react/jsx-runtime': jsx, 'date-fns': dateFns, 'date-fns-tz': dateFnsTz };
let fetchImpl;
const listeners = new Map();
const window = { addEventListener: (name, listener) => listeners.set(name, listener), removeEventListener: (name, listener) => { if (listeners.get(name) === listener) listeners.delete(name); } };
function load(file, extra = '') {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8') + extra, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  runInNewContext(code, { exports, Intl, Number, Date, URL, URLSearchParams, Set, Map, AbortController, setTimeout, clearTimeout, console: { ...console, error() {} }, window, fetch: (...args) => fetchImpl(...args), require: name => name.endsWith('.css') ? { default: classes, __esModule: true } : dependencies[name] ?? new Proxy({}, { get: (_, key) => key === '__esModule' ? true : nil }) });
  return exports;
}
dependencies['@/lib/utils'] = { cn: (...names) => names.filter(Boolean).join(' ') };
dependencies['@/components/ui/stat-card'] = load('src/components/ui/stat-card.tsx');
dependencies['@/components/ui/metric-grid'] = load('src/components/ui/metric-grid.tsx');
const { RosterStats } = load('src/components/roster/RosterStats.tsx');
const props = { retainerBudget: 12500, managedGmv: 84000, videosPublished: 241, retainerComplete: true, retainerMissingCount: 0, gmvComplete: true, videosComplete: true, brandLabel: 'All brands', periodLabel: 'Nov 3 – Nov 9' };
const html = override => renderToStaticMarkup(React.createElement(RosterStats, { ...props, ...override }));
let rendered = html({});
for (const label of ['Retainer budget', 'Current recorded monthly commitments', 'Managed GMV', 'Videos published', '$12,500', '$84,000', '241']) assert.ok(rendered.includes(label), label);
assert.equal((rendered.match(/data-slot="stat-card"/g) ?? []).length, 3, 'Roster metrics render the shared dashboard cards');
assert.ok(!rendered.includes('Partial recorded'));
rendered = html({ retainerBudget: 0, managedGmv: 0, videosPublished: 0 });
assert.equal((rendered.match(/\$0</g) ?? []).length, 2, 'Known complete zero remains a real currency value');
assert.ok(rendered.includes('data-state="ready">0</p>'));
rendered = html({ retainerBudget: null, managedGmv: null, videosPublished: null });
assert.equal((rendered.match(/>Unavailable</g) ?? []).length, 3, 'Permission/read failures stay unavailable');
assert.equal((rendered.match(/data-state="unavailable"/g) ?? []).length, 3);
assert.ok(!rendered.includes('$0'));
rendered = html({ gmvComplete: false, videosComplete: false, retainerComplete: false, retainerMissingCount: 2 });
assert.equal((rendered.match(/Partial recorded data/g) ?? []).length, 2);
assert.ok(rendered.includes('Partial recorded terms'));
assert.ok(rendered.includes('excludes 2 creators without a recorded rate'));
assert.ok(rendered.includes('$84,000'), 'Known recorded subtotal remains visible with partial label');
rendered = html({ loading: true, gmvComplete: false, videosComplete: false });
assert.equal((rendered.match(/>Loading…</g) ?? []).length, 3);
assert.equal((rendered.match(/data-state="loading"/g) ?? []).length, 3);
assert.ok(!rendered.includes('$84,000') && !rendered.includes('Partial recorded'));
assert.ok(html({ stale: true }).includes('Last loaded totals · refresh failed'));
assert.ok(html({ refreshing: true }).includes('Updating totals…'));

// Exercise the actual page's fetching and scope controls with a small hook runtime.
let hook, query = new URLSearchParams('brand=northstar&range=last7&keep=yes');
let deferNavigation = false, navigationQueue = [];
const commitNavigation = href => { query = new URL(href, 'https://fixture.invalid').searchParams; hook.dirty = true; };
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
  'next/navigation': { useSearchParams: () => query, useRouter: () => ({ push: href => { if (deferNavigation) navigationQueue.push(href); else commitNavigation(href); } }) },
  'radix-ui': Object.fromEntries(['DropdownMenu', 'Popover'].map(name => [name, new Proxy({}, { get: (_, key) => `${name}.${String(key)}` })])),
  '@/hooks/use-brand-list': { useBrandList: () => ({ brands: stableBrands, loading: false }) },
  '@/hooks/use-brand-meta': { useBrandMeta: () => brandMeta },
  '@/hooks/use-delayed-flag': { useDelayedFlag: value => value },
  '@/components/layout/navigation-pending': { useNavigationPending: () => ({ startNav: fn => fn() }) },
  '@/lib/data/date-utils': load('src/lib/data/date-utils.ts'),
  '@/components/roster/RosterStats': { RosterStats: 'RosterStats' },
  '@/components/ui/choice-menu': { ChoiceMenu: 'ChoiceMenu' },
  '@/components/dashboard/date-range-picker': { DateRangePicker: 'DateRangePicker' },
  '@/components/roster/studio-roster-table': { StudioRosterTable: 'StudioRosterTable' },
  '@/components/segments/roster-segment-controls': { RosterSegmentControls: 'RosterSegmentControls' },
});
dependencies['@/lib/latest-request'] = load('src/lib/latest-request.ts');
const { Page } = load('src/app/(admin)/roster/page.tsx', '\nexport { RosterContent as Page };');
const newState = () => ({ states: [], refs: [], memos: [], effects: [], pending: [], dirty: true });
let state = newState();
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

// A new mount represents reloading or opening a shared roster link, not retained
// client state. Exercise the real date validator as well as the page's requests.
function mountPeriod(search) {
  for (const effect of state.effects) effect?.cleanup?.();
  state = newState();
  deferNavigation = false;
  navigationQueue = [];
  query = new URLSearchParams(search);
  requests = [];
  fetchImpl = async url => {
    requests.push(url);
    const params = new URL(url, 'https://fixture.invalid').searchParams;
    const response = result();
    if (params.get('range') === 'custom') response.period = { start: params.get('start'), end: params.get('end') };
    return { ok: true, json: async () => response };
  };
  render();
}
const picker = () => find(node => node.type === 'DateRangePicker').props;
const requestedPeriod = () => new URL(requests.at(-1), 'https://fixture.invalid').searchParams;
for (const [search, expected] of [
  ['range=custom&start=2026-10-01&end=2026-10-31', 'custom'],
  ['range=custom&start=2024-02-29&end=2024-02-29', 'custom'],
  ['range=custom', 'last7'],
  ['range=custom&start=2026-10-01', 'last7'],
  ['range=custom&end=2026-10-31', 'last7'],
  ['range=custom&start=not-a-date&end=2026-10-31', 'last7'],
  ['range=custom&start=2026-10-01&end=not-a-date', 'last7'],
  ['range=custom&start=2026-02-30&end=2026-03-01', 'last7'],
  ['range=custom&start=2026-10-31&end=2026-10-01', 'last7'],
  ['range=unknown&start=2026-10-01&end=2026-10-31', 'last7'],
  ['range=last30&start=2026-10-01&end=2026-10-31', 'last30'],
  ['', 'last7'],
]) {
  mountPeriod(`brand=northstar&keep=yes&${search}`);
  await settle();
  assert.equal(picker().value, expected, `Cold period selection: ${search}`);
  assert.equal(requestedPeriod().get('range'), expected, `Cold request period: ${search}`);
  assert.equal(requestedPeriod().get('brand'), 'northstar');
  if (expected === 'custom') {
    assert.equal(requestedPeriod().get('start'), query.get('start'));
    assert.equal(requestedPeriod().get('end'), query.get('end'));
    assert.equal(picker().customRange.start, query.get('start'));
    assert.equal(picker().customRange.end, query.get('end'));
  } else {
    assert.equal(requestedPeriod().get('start'), null, 'Fallback/preset requests do not send custom dates');
    assert.equal(requestedPeriod().get('end'), null);
    assert.equal(picker().customRange.start, null);
    assert.equal(picker().customRange.end, null);
  }
}

mountPeriod('brand=evergreen&keep=yes&range=custom&start=2026-10-01&end=2026-10-31');
await settle();
picker().onPresetChange('last30');
await settle();
assert.equal(query.get('range'), 'last30', 'Preset changes persist to the URL');
assert.equal(query.get('brand'), 'evergreen');
assert.equal(query.get('keep'), 'yes');
assert.equal(query.get('start'), null, 'Preset changes remove stale custom dates');
assert.equal(query.get('end'), null);
mountPeriod(query.toString());
await settle();
assert.equal(picker().value, 'last30', 'Reload retains the selected preset');
assert.equal(requestedPeriod().get('range'), 'last30');
const beforeCustom = query.toString();
picker().onPresetChange('custom');
assert.equal(query.toString(), beforeCustom, 'The intermediate custom callback does not navigate without dates');
picker().onCustomChange('2026-11-01', '2026-11-07');
await settle();
assert.equal(query.get('range'), 'custom', 'Confirmed custom dates persist to the URL');
assert.equal(query.get('start'), '2026-11-01');
assert.equal(query.get('end'), '2026-11-07');
assert.equal(query.get('brand'), 'evergreen');
assert.equal(query.get('keep'), 'yes');
mountPeriod(query.toString());
await settle();
assert.equal(picker().value, 'custom', 'Reload retains the selected custom range');
assert.equal(requestedPeriod().get('start'), '2026-11-01');
assert.equal(requestedPeriod().get('end'), '2026-11-07');
assert.equal(stats().periodLabel, '11/1/26 – 11/7/26');
// Next keeps the page mounted for browser back/forward between query strings.
const savedCustomQuery = query.toString();
query = new URLSearchParams('brand=evergreen&keep=yes&range=last30');
state.dirty = true;
await settle();
assert.equal(picker().value, 'last30', 'History navigation updates the mounted picker');
assert.equal(requestedPeriod().get('range'), 'last30');
assert.equal(requestedPeriod().get('start'), null);
query = new URLSearchParams(savedCustomQuery);
state.dirty = true;
await settle();
assert.equal(picker().value, 'custom', 'History navigation restores the custom range');
assert.equal(requestedPeriod().get('start'), '2026-11-01');
assert.equal(requestedPeriod().get('end'), '2026-11-07');
// Real navigation commits asynchronously. Rapid edits must compose with the
// latest requested URL, including when an earlier navigation commits first.
mountPeriod('brand=northstar&range=last7&keep=yes');
await settle();
deferNavigation = true;
picker().onPresetChange('last30');
await settle();
find(node => node.type === 'ChoiceMenu' && node.props.label === 'Brand').props.onChange('evergreen');
assert.equal(new URL(navigationQueue.at(-1), 'https://fixture.invalid').searchParams.get('range'), 'last30', 'Queued brand navigation preserves pending period');
commitNavigation(navigationQueue.shift());
await settle();
picker().onCustomChange('2026-11-01', '2026-11-07');
assert.equal(new URL(navigationQueue.at(-1), 'https://fixture.invalid').searchParams.get('brand'), 'evergreen', 'Partial commit cannot discard a later pending brand');
commitNavigation(navigationQueue.shift());
await settle();
assert.equal(picker().value, 'custom', 'Intermediate commits do not undo the latest selected period');
commitNavigation(navigationQueue.shift());
await settle();
assert.equal(query.get('brand'), 'evergreen');
assert.equal(query.get('start'), '2026-11-01');
assert.equal(query.get('end'), '2026-11-07');
assert.equal(query.get('keep'), 'yes');
assert.equal(requestedPeriod().get('brand'), 'evergreen');
assert.equal(requestedPeriod().get('range'), 'custom');
// A history URL becomes the new base for subsequent edits, not a stale
// optimistic query from a completed navigation.
commitNavigation('/roster?brand=northstar&range=last7&keep=history');
await settle();
find(node => node.type === 'ChoiceMenu' && node.props.label === 'Brand').props.onChange('evergreen');
picker().onPresetChange('last14');
const queued = new URL(navigationQueue.at(-1), 'https://fixture.invalid').searchParams;
assert.equal(queued.get('brand'), 'evergreen', 'Queued period navigation preserves pending brand');
assert.equal(queued.get('range'), 'last14');
assert.equal(queued.get('keep'), 'history', 'New edits use the browser-history query');
assert.equal(queued.get('start'), null);
assert.equal(queued.get('end'), null);
while (navigationQueue.length) { commitNavigation(navigationQueue.shift()); await settle(); }
assert.equal(picker().value, 'last14');
assert.equal(requestedPeriod().get('brand'), 'evergreen');
assert.equal(requestedPeriod().get('range'), 'last14');
find(node => node.type === 'RosterSegmentControls').props.onApply({ brand: 'northstar', range: 'custom', start: '2026-10-01', end: '2026-10-31' }, 'October Northstar');
assert.equal(navigationQueue.length, 1, 'Saved segment composes brand and period into one navigation');
commitNavigation(navigationQueue.shift());
await settle();
assert.equal(query.get('brand'), 'northstar');
assert.equal(query.get('range'), 'custom');
assert.equal(query.get('start'), '2026-10-01');
assert.equal(query.get('end'), '2026-10-31');
assert.equal(picker().value, 'custom', 'Committed segment retains its period');
mountPeriod(query.toString());
await settle();
assert.equal(requestedPeriod().get('brand'), 'northstar');
assert.equal(requestedPeriod().get('start'), '2026-10-01');
assert.equal(requestedPeriod().get('end'), '2026-10-31');
for (const effect of state.effects) effect?.cleanup?.();
console.log('PASS roster header: real component zero/null/partial/loading/stale rendering; actual page brand handoff, period URL persistence and cold-load validation, stale-scope hiding and unavailable refresh replacement');
