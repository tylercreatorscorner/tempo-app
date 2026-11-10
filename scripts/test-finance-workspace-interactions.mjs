import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as jsx from 'react/jsx-runtime';
import ts from 'typescript';

// Run real component handlers/effects with deterministic fictional responses.
let hooks, fetchImpl, confirmResult = false;
const react = {
  useState(initial) { const i = hooks.stateIndex++; if (!(i in hooks.states)) hooks.states[i] = typeof initial === 'function' ? initial() : initial; const owner = hooks; return [owner.states[i], next => { owner.states[i] = typeof next === 'function' ? next(owner.states[i]) : next; }]; },
  useRef(initial) { const i = hooks.refIndex++; return hooks.refs[i] ??= { current: initial }; },
  useEffect(effect, deps) { const i = hooks.effectIndex++, previous = hooks.effects[i]; if (!previous || deps.some((v, j) => !Object.is(v, previous.deps[j]))) hooks.pending.push(() => { previous?.cleanup?.(); hooks.effects[i] = { deps, cleanup: effect() }; }); },
  useMemo(fn, deps) { const i = hooks.memoIndex++, previous = hooks.memos[i]; if (!previous || deps.some((v, j) => !Object.is(v, previous.deps[j]))) hooks.memos[i] = { deps, value: fn() }; return hooks.memos[i].value; },
  useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
};
const dependencies = {
  react, 'react/jsx-runtime': jsx,
  '@/lib/utils': { cn: (...args) => args.filter(Boolean).join(' ') },
  '@/lib/utils/format': { formatCurrency: n => `$${n}`, formatDate: s => s, formatPeriod: s => s, currentMonth: () => '2026-10', buildMonthOptions: () => [] },
  '@/hooks/use-delayed-flag': { useDelayedFlag: value => value },
  '@/lib/finance/overdue': { isOverdue: () => false, daysOverdue: () => 0, todayIsoUtc: () => '2026-11-10' },
  '@/hooks/use-brand-meta': { useBrandMeta: () => ({ label: value => value, color: () => '#000' }) },
  '@/components/ui/button': { Button: 'Button', buttonVariants: () => '' },
  '@/components/ui/modal-overlay': { ModalOverlay: 'ModalOverlay' },
  './mark-paid-modal': { MarkPaidModal: 'MarkPaidModal' },
  '@/components/ui/choice-menu': { ChoiceMenu: 'ChoiceMenu' },
};
function load(file, extra = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  runInNewContext(code, {
    exports, Date, URL, Intl, setTimeout, clearTimeout,
    window: { addEventListener() {}, removeEventListener() {}, location: { origin: 'https://fixture.invalid' } },
    confirm: () => confirmResult,
    fetch: (...args) => fetchImpl(...args),
    require: name => extra[name] ?? dependencies[name] ?? new Proxy({}, { get: (_, key) => key === '__esModule' ? true : String(key) }),
  });
  return exports;
}
function harness(Component, props) {
  const state = { states: [], refs: [], effects: [], memos: [], stateIndex: 0, refIndex: 0, effectIndex: 0, memoIndex: 0, pending: [] };
  return { render() { hooks = state; Object.assign(state, { stateIndex: 0, refIndex: 0, effectIndex: 0, memoIndex: 0, pending: [] }); const tree = Component(props); state.pending.forEach(effect => effect()); return tree; }, close() { state.effects.forEach(effect => effect.cleanup?.()); } };
}
function nodes(root) { if (!root || typeof root !== 'object') return []; if (Array.isArray(root)) return root.flatMap(nodes); return [root, ...nodes(root.props?.children)]; }
function label(root) { if (typeof root === 'string' || typeof root === 'number') return String(root); if (Array.isArray(root)) return root.map(label).join(''); return root?.props ? label(root.props.children) : ''; }
const find = (tree, predicate) => { const node = nodes(tree).find(predicate); assert.ok(node, 'Expected control missing'); return node; };
const button = (tree, text) => find(tree, node => ['button', 'Button'].includes(node.type) && label(node) === text);
const flush = () => new Promise(resolve => setImmediate(resolve));
const response = (json, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => json });
const { receivedAmount } = load('src/lib/finance/received-amount.ts');
dependencies['@/lib/finance/received-amount'] = { receivedAmount };
assert.equal(receivedAmount({ total_amount: 1000, amount_received: 800 }), 800);
assert.equal(receivedAmount({ total_amount: 1000, amount_received: 0 }), 0);
assert.equal(receivedAmount({ total_amount: 1000, amount_received: null }), 1000);
assert.equal(receivedAmount({ total_amount: '1000', amount_received: '800.25' }), 800.25);

const { InvoiceDetailSheet } = load('src/app/(admin)/invoicing/components/invoice-detail-sheet.tsx');
const fixture = { id: 'fictional', invoice_number: 'FIXTURE-1', brand: 'alpha', period_month: '2026-10', commission: 0, retainer: 1000, product_retainer: 0, launch_fee: 0, total_amount: 1000, affiliate_gmv: 0, marketing_gmv: 0, total_gmv: 0, status: 'sent', generated_at: '2026-11-01', sent_at: '2026-11-02', notes: 'Original note', bill_to_email: 'billing@example.invalid' };
let requests = [], closed = 0, updated = [];
fetchImpl = async (url, options) => { requests.push({ url, ...options }); return response({ invoice: { ...fixture, ...JSON.parse(options.body) } }); };
const props = { invoice: fixture, canEdit: false, onClose: () => closed++, onUpdated: invoice => updated.push(invoice), onDeleted: () => assert.fail('Unexpected delete') };
let session = harness(InvoiceDetailSheet, props), tree = session.render();
assert.equal(button(tree, 'Save changes').props.disabled, true);
assert.equal(find(tree, n => n.type === 'fieldset').props.disabled, true);
await button(tree, 'Send').props.onClick(); await button(tree, 'Save changes').props.onClick();
assert.equal(requests.length, 0, 'Read-only handlers cannot issue mutations');
session.close();
session = harness(InvoiceDetailSheet, { ...props, canEdit: true }); tree = session.render();
find(tree, n => n.type?.name === 'TextArea' && n.props.value === 'Original note').props.onChange('Unsaved note'); tree = session.render();
assert.equal(button(tree, 'Send').props.disabled, true);
assert.equal(button(tree, 'Mark as Paid').props.disabled, true);
await button(tree, 'Send').props.onClick(); assert.equal(requests.length, 0);
find(tree, n => n.type === 'ModalOverlay').props.onClose(); assert.equal(closed, 0, 'Rejecting discard preserves the draft');
assert.equal(button(tree, 'Save changes').props.disabled, false);
await button(tree, 'Save changes').props.onClick();
assert.equal(updated.at(-1).notes, 'Unsaved note');
session.close();

const normalizedProps = { ...props, invoice: { ...fixture, status: 'pending' }, canEdit: true, onUpdated: value => { normalizedProps.invoice = value; } };
let normalizedCommission = 1200;
fetchImpl = async () => response({ invoice: { ...normalizedProps.invoice, commission: normalizedCommission, retainer: 0, total_amount: normalizedCommission } });
session = harness(InvoiceDetailSheet, normalizedProps); tree = session.render();
find(tree, n => n.type?.name === 'NumberInput' && n.props.value === 1000).props.onChange(1200); tree = session.render();
await button(tree, 'Save changes').props.onClick(); tree = session.render();
assert.equal(button(tree, 'Save changes').props.disabled, true, 'Server-normalized save immediately becomes the clean draft');
assert.equal(button(tree, 'Send').props.disabled, false);
assert.equal(find(tree, n => n.type?.name === 'NumberInput').props.value, 1200);
normalizedCommission = 1500;
await button(tree, 'Refresh from Earnings').props.onClick(); tree = session.render();
assert.equal(find(tree, n => n.type?.name === 'NumberInput').props.value, 1500, 'Refresh displays authoritative recomputed lines for the same invoice ID');
assert.equal(button(tree, 'Save changes').props.disabled, true, 'A refreshed invoice cannot offer an overwrite using its old draft');
assert.equal(button(tree, 'Send').props.disabled, false); session.close();

requests = []; updated = [];
let finish;
fetchImpl = (url, options) => { requests.push({ url, ...options }); return new Promise(resolve => { finish = () => resolve(response({ invoice: { ...fixture, ...JSON.parse(options.body) } })); }); };
session = harness(InvoiceDetailSheet, { ...props, canEdit: true }); tree = session.render();
button(tree, 'Mark as Paid').props.onClick(); tree = session.render();
let paidModal = find(tree, n => n.type === 'MarkPaidModal');
const pendingPayment = paidModal.props.onConfirm({ payment_method: 'wire', payment_reference: 'FIXTURE', amount_received: 800, payment_received_notes: 'Fixture fees' });
tree = session.render(); assert.equal(button(tree, 'Send').props.disabled, true);
find(tree, n => n.type === 'ModalOverlay').props.onClose(); assert.equal(closed, 0, 'Pending payment cannot close its invoice');
finish(); await pendingPayment; tree = session.render();
assert.equal(requests.length, 1, 'Payment detail and paid status use one request');
assert.equal(JSON.parse(requests[0].body).status, 'paid');
assert.equal(updated[0].amount_received, 800);
assert.equal(find(tree, n => n.type === 'MarkPaidModal').props.open, false);
session.close();
fetchImpl = async () => response({ error: 'Fixture payment failure' }, false);
session = harness(InvoiceDetailSheet, { ...props, canEdit: true }); tree = session.render();
button(tree, 'Mark as Paid').props.onClick(); tree = session.render();
await find(tree, n => n.type === 'MarkPaidModal').props.onConfirm({ payment_method: 'wire', amount_received: 0 }); tree = session.render();
paidModal = find(tree, n => n.type === 'MarkPaidModal');
assert.equal(paidModal.props.open, true); assert.equal(paidModal.props.serverError, 'Fixture payment failure');
session.close();

const { TeamMembersSection } = load('src/components/settings/team-members-section.tsx');
fetchImpl = async () => response({ error: 'Fixture billing failure' }, false);
session = harness(TeamMembersSection, { canEdit: true }); session.render(); await flush(); tree = session.render();
assert.ok(find(tree, n => n.props?.role === 'alert'));
assert.ok(!label(tree).includes('No team members yet'), 'Failed reads never become an empty billing state');
fetchImpl = async () => response({ teamMembers: [] });
await button(tree, 'Retry').props.onClick(); tree = session.render();
assert.ok(label(tree).includes('No team members yet')); session.close();

const { CompensationArrangementsSection } = load('src/components/settings/compensation-arrangements-section.tsx');
let deferred = new Map();
fetchImpl = async url => {
  if (url === '/api/team-members') return response({ teamMembers: [{ id: 'payee', name: 'Fixture Payee' }] });
  const month = new URL(url, 'https://fixture.invalid').searchParams.get('month');
  return new Promise(resolve => deferred.set(month, value => resolve(response({ arrangements: [{ id: month, brand: 'alpha', team_member_id: 'payee', retainer: value, commission_rate: 0 }] }))));
};
session = harness(CompensationArrangementsSection, { brands: [{ slug: 'alpha', name: 'Alpha' }], canEdit: true }); session.render();
deferred.get('2026-10')(100); await flush(); tree = session.render();
const monthInput = find(tree, n => n.type === 'input' && n.props.type === 'month');
monthInput.props.onChange({ target: { value: '2026-09' } }); session.render();
monthInput.props.onChange({ target: { value: '2026-08' } }); session.render();
deferred.get('2026-08')(800); await flush(); tree = session.render();
deferred.get('2026-09')(900); await flush(); tree = session.render();
assert.equal(find(tree, n => n.type === 'input' && n.props.type === 'month').props.value, '2026-08');
find(tree, n => n.props?.['aria-label'] === 'Edit Alpha compensation for Fixture Payee').props.onClick(); tree = session.render();
assert.equal(find(tree, n => n.type?.name === 'EditModal').props.form.retainer, 800, 'Late prior-month terms cannot enter the new month editor');
assert.equal(find(tree, n => n.type === 'input' && n.props.type === 'month').props.disabled, true, 'Editing terms cannot change their save month');
session.close();
fetchImpl = async () => response({ error: 'Fixture load failure' }, false);
session = harness(CompensationArrangementsSection, { brands: [], canEdit: true }); session.render(); await flush(); tree = session.render();
assert.ok(find(tree, n => n.props?.role === 'alert')); assert.ok(button(tree, 'Retry'));
session.close();

const { YearView } = load('src/app/(admin)/earnings/components/year-view.tsx');
const annual = year => ({ year, months: [], brands: [], totals: { earnings: year, totalGmv: 0, commission: 0, retainers: 0, launchFees: 0 } });
deferred = new Map();
fetchImpl = async url => new Promise(resolve => { const year = Number(new URL(url, 'https://fixture.invalid').searchParams.get('year')); deferred.set(year, () => resolve(response(annual(year)))); });
session = harness(YearView, { initialYear: 2026 }); tree = session.render();
find(tree, n => n.type === 'ChoiceMenu').props.onChange('2025'); tree = session.render();
find(tree, n => n.type === 'ChoiceMenu').props.onChange('2024'); session.render();
deferred.get(2024)(); await flush(); tree = session.render();
deferred.get(2025)(); deferred.get(2026)(); await flush(); tree = session.render();
assert.equal(find(tree, n => n.type === 'FinanceMetricStrip').props.metrics[0].label, '2024 earnings');
assert.equal(find(tree, n => n.type === 'FinanceMetricStrip').props.metrics[0].value, '$2024'); session.close();

const { PaymentsClient } = load('src/app/(admin)/payments/payments-client.tsx');
const totals = { retainerBook: 1000, retainerCreatorCount: 1, outstandingAmount: 0, outstandingCount: 0, overdueAmount: 0, overdueCount: 0, collectedAmount: 800, collectedCount: 1, brandSpend: {} };
deferred = new Map();
fetchImpl = async url => {
  if (url.endsWith('/history')) return response({ error: 'Fixture history failure' }, false);
  if (url.endsWith('/overview')) return new Promise(resolve => deferred.set('overview', () => resolve(response(totals))));
  const brand = new URL(url, 'https://fixture.invalid').searchParams.get('brand');
  return new Promise(resolve => deferred.set(brand, () => resolve(response({ creators: [{ brand, creator_name: `Fixture ${brand}`, retainer: 100 }] }))));
};
session = harness(PaymentsClient, {}); session.render(); await flush(); deferred.get('overview')(); deferred.get('all')(); await flush(); tree = session.render();
assert.equal(find(tree, n => n.type === 'AuditFeed').props.error, 'Fixture history failure', 'Overview success must not hide an independent activity failure');
let book = find(tree, n => n.type === 'RetainerBook');
book.props.onBrandFilterChange('alpha'); tree = session.render();
find(tree, n => n.type === 'RetainerBook').props.onBrandFilterChange('beta'); session.render();
deferred.get('beta')(); await flush(); deferred.get('alpha')(); await flush(); tree = session.render();
book = find(tree, n => n.type === 'RetainerBook');
assert.equal(book.props.brandFilter, 'beta'); assert.equal(book.props.creators[0].brand, 'beta'); session.close();

const { NewInvoiceModal } = load('src/app/(admin)/invoicing/components/new-invoice-modal.tsx');
deferred = new Map();
fetchImpl = async (url, options) => {
  assert.ok(!options?.method, 'Preview interaction must not create invoices');
  if (url === '/api/team-members') return response({ teamMembers: [] });
  const month = new URL(url, 'https://fixture.invalid').searchParams.get('month');
  return new Promise(resolve => deferred.set(month, () => resolve(response({ brands: [{ brand: 'alpha', brandLabel: 'Alpha', total: 1000, retainer: 1000, totalGmv: 0, commission: 0, productRetainer: 0, launchFee: 0 }] }))));
};
session = harness(NewInvoiceModal, { open: true, defaultMonth: '2026-10', onClose() {}, onCreated() {}, onViewExisting() {} }); session.render();
deferred.get('2026-10')(); await flush(); tree = session.render();
find(tree, n => n.type === 'button' && label(n).startsWith('Alpha')).props.onClick(); tree = session.render();
assert.equal(button(tree, 'Generate Invoice').props.disabled, false);
find(tree, n => n.type === 'ChoiceMenu' && n.props.label === 'Invoice month').props.onChange('2026-09'); session.render(); tree = session.render();
assert.equal(button(tree, 'Generate Invoice').props.disabled, true);
assert.ok(!label(tree).includes('Invoice preview'), 'Old month preview disappears before the next preview succeeds');
session.close();
const { EarningsKpis } = load('src/app/(admin)/earnings/components/earnings-kpis.tsx');
tree = EarningsKpis({ data: { totals: { earnings: 3000, retainers: 3000, commission: 0 }, brands: [800, 0, null].map(amountReceived => ({ total: 1000, invoice: { totalAmount: 1000, amountReceived, status: 'paid' } })) }, series: null, todayIso: '2026-11-10' });
assert.equal(tree.props.metrics.find(metric => metric.label === 'Collected').value, '$1800', 'Earnings receipts match payment/invoice receipt semantics, including legacy fallback');
const { InvoiceList } = load('src/app/(admin)/invoicing/components/invoice-list.tsx', { '@/lib/utils/csv': { downloadCsv: () => assert.fail('An empty filter must not export all invoices') } });
session = harness(InvoiceList, { invoices: [fixture], loading: false, todayIso: '2026-11-10', teamMembers: [], canEdit: false, canBulk: false, onOpen() {}, onCreate() {}, onRefresh() {}, onMerge() {} }); tree = session.render();
assert.ok(nodes(tree).filter(n => n.type === 'input' && n.props.type === 'checkbox').every(n => n.props.disabled));
find(tree, n => n.type?.name === 'SearchInput').props.onChange('no matching invoice'); tree = session.render();
assert.equal(button(tree, 'CSV').props.disabled, true);
button(tree, 'CSV').props.onClick(); session.close();
console.log('PASS receipt amounts, read-only actions, unsaved edits, atomic payments/errors, failed reads, stale month/year/brand guards, independent failures, and invoice preview reset');
