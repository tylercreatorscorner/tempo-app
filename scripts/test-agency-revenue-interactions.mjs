import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as jsx from 'react/jsx-runtime';
import ts from 'typescript';

// Exercise the real workspace's event handlers and effects with controlled,
// read-only responses. This covers transitions that server rendering cannot.
let hooks, fetchImpl;
const classes = new Proxy({}, { get: (_, name) => String(name) });
const react = {
  useState(initial) { const index = hooks.stateIndex++; if (!(index in hooks.states)) hooks.states[index] = typeof initial === 'function' ? initial() : initial; const owner = hooks; return [owner.states[index], next => { owner.states[index] = typeof next === 'function' ? next(owner.states[index]) : next; }]; },
  useRef(initial) { const index = hooks.refIndex++; return hooks.refs[index] ??= { current: initial }; },
  useEffect(effect, deps) { const index = hooks.effectIndex++, previous = hooks.effects[index]; if (!previous || deps.some((value, offset) => !Object.is(value, previous.deps[offset]))) hooks.pending.push(() => { previous?.cleanup?.(); hooks.effects[index] = { deps, cleanup: effect() }; }); },
};
const location = { href: 'http://fixture.invalid/agency/revenue?scenario=normal#details' };
const history = { replaceState(state, _, url) { assert.equal(state, null); location.href = String(url); } };
const dependency = {
  react, 'react/jsx-runtime': jsx, 'next/link': { default: 'Link', __esModule: true },
  'radix-ui': { Dialog: new Proxy({}, { get: (_, key) => `Dialog.${String(key)}` }), Popover: new Proxy({}, { get: (_, key) => `Popover.${String(key)}` }) },
  '@/components/ui/choice-menu': { ChoiceMenu: 'ChoiceMenu' }, '@/components/ui/search-input': { SearchInput: 'SearchInput' },
  '@/components/creators/brand-portrait': { BrandPortrait: 'BrandPortrait' },
};
function load(file) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  runInNewContext(code, { exports, window: { location, history }, document: { activeElement: null }, Intl, Date, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, fetch: (...args) => fetchImpl(...args), require: name => name.endsWith('.css') ? { default: classes, __esModule: true } : dependency[name] ?? new Proxy({}, { get: (_, key) => key === '__esModule' ? true : () => null }) });
  return exports;
}
dependency['@/lib/agency/navigation'] = load('src/lib/agency/navigation.ts');
const { AgencyRevenueWorkspace } = load('src/app/(admin)/agency/revenue/workspace.tsx');
function harness(props) {
  const state = { states: [], refs: [], effects: [], stateIndex: 0, refIndex: 0, effectIndex: 0, pending: [] };
  return { render() { hooks = state; Object.assign(state, { stateIndex: 0, refIndex: 0, effectIndex: 0, pending: [] }); const tree = AgencyRevenueWorkspace(props); state.pending.forEach(effect => effect()); return tree; }, close() { state.effects.forEach(effect => effect.cleanup?.()); } };
}
function nodes(root) { if (!root || typeof root !== 'object') return []; if (Array.isArray(root)) return root.flatMap(nodes); return [root, ...nodes(root.props?.children)]; }
const find = (tree, predicate) => { const result = nodes(tree).find(predicate); assert.ok(result, 'Expected control missing'); return result; };
const button = (tree, name) => find(tree, node => node.type === 'button' && (node.props['aria-label'] === name || node.props.children === name));
const picker = tree => find(tree, node => node.type?.name === 'RevenueMonthPicker');
const flush = () => new Promise(resolve => setImmediate(resolve));
const row = { clientId: 'client-1', clientName: 'Example Client', month: '2026-10', status: 'ready', knownIncludedInTotals: true, feePending: false, managerPending: false, billingReviewRequired: false, gmvComplete: true, knownFeeCents: 100000, knownManagerCents: 40000, knownRetainedCents: 60000, brandCoverage: [], reasons: [] };
const dataset = month => ({ month, periodStart: `${month}-01`, periodEnd: `${month}-30`, throughDate: `${month}-28`, rows: [{ ...row, month }], totals: { complete: true, knownIncludedCount: 1, knownFeeCents: 100000, knownManagerCents: 40000, knownRetainedCents: 60000 }, warnings: [], cash: { complete: true, collectedCents: 0, managerPaidCents: 0, retainedCashCents: 0, collectedCount: 0, managerPaidCount: 0 } });
let requests = [], invoiceRevision = 1, invoiceFailure = false, pendingRevenue;
fetchImpl = async (url, options) => {
  assert.ok(!options.method || options.method === 'GET', 'Revenue controls must remain read-only');
  requests.push(url);
  if (url === '/api/agency/finance') return { ok: !invoiceFailure, json: async () => invoiceFailure ? { error: 'Fixture invoice failure' } : { invoices: [{ id: 'invoice-1', month: '2026-10', revision: invoiceRevision }] } };
  const response = { ok: true, json: async () => dataset(new URL(url, location.href).searchParams.get('month')) };
  return pendingRevenue ? new Promise(resolve => { pendingRevenue.resolve = () => resolve(response); }) : response;
};

const session = harness({ initialData: dataset('2026-10'), latestMonth: '2026-10' });
let tree = session.render();
assert.equal(requests.length, 0, 'Seeded results do not need an initial fetch');
assert.equal(new URL(location.href).searchParams.get('month'), '2026-10', 'Bare initial URLs expose the selected month to Agency navigation');
assert.equal(new URL(location.href).hash, '#details');
picker(tree).props.onChange('2026-09'); tree = session.render(); await flush(); tree = session.render();
assert.equal(tree.props['aria-busy'], false);
picker(tree).props.onChange('2026-10'); tree = session.render(); await flush(); tree = session.render();
assert.equal(requests.length, 2, 'Returning to the seeded month fetches it again instead of getting stuck');
assert.equal(tree.props['aria-busy'], false);
assert.equal(picker(tree).props.month, '2026-10');

pendingRevenue = {};
picker(tree).props.onChange('2026-09'); tree = session.render();
assert.equal(button(tree, 'View inclusion').props.disabled, true, 'Previous-month inclusion must not open during a month change');
assert.equal(find(tree, node => node.type?.name === 'RevenueClientRow').props.disabled, true);
const headerLink = find(tree, node => node.type === 'Link' && node.props.children?.[0] === 'Review setup ');
assert.equal(new URL(headerLink.props.href, location.href).searchParams.get('month'), '2026-10', 'Setup links match the last loaded results during a month transition');
pendingRevenue.resolve(); pendingRevenue = null; await flush(); tree = session.render();
assert.equal(button(tree, 'View inclusion').props.disabled, false);

pendingRevenue = {};
picker(tree).props.onChange('2026-08'); tree = session.render();
const superseded = pendingRevenue; pendingRevenue = null;
picker(tree).props.onChange('2026-09'); tree = session.render(); await flush(); tree = session.render();
superseded.resolve(); await flush(); tree = session.render();
assert.equal(picker(tree).props.month, '2026-09', 'A slow request does not block another month selection');
assert.equal(find(tree, node => node.type?.name === 'RevenueClientRow').props.row.month, '2026-09', 'A superseded response cannot replace the selected month');
assert.equal(tree.props['aria-busy'], false);

find(tree, node => node.type === 'SearchInput').props.onChange({ target: { value: 'missing client' } }); tree = session.render();
assert.ok(nodes(tree).some(node => node.type === 'h3' && node.props.children === 'No clients match these filters'));
button(tree, 'Clear filters').props.onClick(); tree = session.render();
assert.equal(find(tree, node => node.type === 'SearchInput').props.value, '');
assert.equal(find(tree, node => node.type === 'ChoiceMenu').props.value, 'all');

picker(tree).props.onChange('2026-10'); tree = session.render(); await flush(); tree = session.render();
button(tree, 'Invoices').props.onClick(); tree = session.render(); await flush(); tree = session.render();
assert.equal(find(tree, node => node.type?.name === 'InvoiceTable').props.invoices[0].revision, 1);
invoiceRevision = 2;
button(tree, 'Refresh revenue').props.onClick(); tree = session.render(); await flush(); tree = session.render();
assert.equal(find(tree, node => node.type?.name === 'InvoiceTable').props.invoices[0].revision, 2, 'Refresh on Invoices reads current invoice records');
invoiceFailure = true;
button(tree, 'Refresh revenue').props.onClick(); tree = session.render(); await flush(); tree = session.render();
assert.equal(find(tree, node => node.type?.name === 'InvoiceTable').props.invoices[0].revision, 2, 'Failed refresh preserves loaded invoices');
assert.ok(nodes(tree).some(node => node.props?.children === 'Last loaded invoice records remain below until a refresh succeeds.'));
invoiceFailure = false; invoiceRevision = 3;
button(tree, 'Retry invoices').props.onClick(); tree = session.render();
assert.ok(!nodes(tree).some(node => node.props?.role === 'alert'), 'Retry clears the previous failure while the next request is pending');
await flush(); tree = session.render();
assert.equal(find(tree, node => node.type?.name === 'InvoiceTable').props.invoices[0].revision, 3);
session.close();

const initialInvoices = harness({ initialData: dataset('2026-10'), latestMonth: '2026-10', initialView: 'invoices' });
tree = initialInvoices.render();
assert.ok(nodes(tree).some(node => node.props?.role === 'status' && node.props.children === 'Loading saved invoice records…'), 'Opening directly into Invoices announces its initial request');
await flush(); initialInvoices.close();
console.log('PASS Revenue interactions: month return, canonical URL, stale controls, filter reset, invoice refresh/failure/retry and read-only requests');
