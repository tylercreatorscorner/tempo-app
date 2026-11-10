import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Exercise the actual directory render and click closures with authorized API
// rows. No network requests, report creation, or live records are involved.
const require = createRequire(import.meta.url);
let stateValues = [], stateIndex = 0, params = new URLSearchParams(), replaced = [], generated = [];
const hooks = {
  useState: initial => {
    const index = stateIndex++;
    const value = index < stateValues.length ? stateValues[index] : typeof initial === 'function' ? initial() : initial;
    return [value, () => {}];
  },
  useEffect: () => {}, useCallback: callback => callback,
};
const deps = {
  react: hooks,
  'react/jsx-runtime': require('react/jsx-runtime'),
  'next/navigation': { useRouter: () => ({ replace: url => replaced.push(url) }), useSearchParams: () => params },
  'lucide-react': new Proxy({}, { get: () => 'svg' }),
  '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
  '@/hooks/use-delayed-flag': { useDelayedFlag: () => false },
  '@/components/ui/search-input': { SearchInput: 'input' },
  '@/components/ui/button': { Button: 'button' },
  '@/components/ui/badge': { Badge: 'span' },
  '@/components/ui/table': { TableCard: 'div', Table: 'table', THead: 'thead', TBody: 'tbody', TR: 'tr', TH: 'th', TD: 'td' },
  '@/components/ui/table-load-bar': { TableLoadBar: 'load-bar' },
  '@/components/ui/page-skeletons': { TableSkeleton: 'skeleton' },
  '@/components/ui/empty-state': { EmptyState: 'empty-state' },
  './report-actions': { ReportActions: 'report-actions' },
  '@/components/creators/brand-identity': { BrandIdentity: 'brand-identity' },
  './workspace.module.css': { default: new Proxy({}, { get: (_, key) => String(key) }), __esModule: true },
};
const exports = {};
runInNewContext(ts.transpileModule(readFileSync('src/app/(admin)/reporting/brand-table.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, { exports, Date, Math, URLSearchParams, require: name => {
  if (!(name in deps)) throw Error(`Unexpected dependency ${name}`);
  return deps[name];
} });
const row = (slug, name, daysPresent, daysBehind = 0) => ({ slug, name, color: '#6e4bcc', reportCount: 0, lastReport: null,
  coverage: { daysExpected: 7, daysPresent, presentDays: [], missingDays: [], windowStart: '2026-10-19', windowEnd: '2026-10-25', lastDataDay: '2026-10-25', daysBehind } });
const authorizedRows = [row('alpha', 'Alpha', 7), row('beta', 'Beta', 1), row('gamma', 'Gamma', 7, 8)];
const children = node => node && typeof node === 'object' && node.props ? [node, ...children(node.props.children)] : Array.isArray(node) ? node.flatMap(children) : [];
const text = node => node === null || node === undefined || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('')
  : typeof node === 'object' ? text(node.props?.children) : String(node);
function render(search, { filter = 'all', query = '' } = {}) {
  params = new URLSearchParams(search); stateIndex = 0;
  stateValues = [query, filter, authorizedRows, false, null, false, 0];
  return exports.BrandTable({ refreshKey: 0, onGenerate: (slug, name) => generated.push({ slug, name }) });
}
const rowsIn = tree => children(tree).filter(node => typeof node.type === 'function' && node.type.name === 'BrandRows');
const button = (tree, label) => children(tree).find(node => node.type === 'button' && text(node) === label);
const readiness = tree => children(tree).filter(node => node.type === 'button' && typeof node.props['aria-pressed'] === 'boolean').map(node => text(node));

let tree = render('brand=alpha&view=clients');
assert.deepEqual(rowsIn(tree).map(node => node.props.row.slug), ['alpha']);
assert.deepEqual(readiness(tree), ['Selected brand1', 'Can prepare1', 'Check data0']);
assert.ok(!rowsIn(tree).some(node => node.props.row.slug === 'beta'), 'A dashboard handoff does not silently show another authorized brand');
const brandRow = rowsIn(tree)[0]; stateIndex = 0; stateValues = [];
const detail = brandRow.type(brandRow.props);
const prepare = children(detail).find(node => node.props['aria-label'] === 'Prepare report for Alpha');
assert.equal(prepare.props.disabled, false); prepare.props.onClick();
assert.deepEqual(generated, [{ slug: 'alpha', name: 'Alpha' }], 'The compose target is the selected authorized row');

tree = render('brand=beta&view=library&keep=one');
assert.deepEqual(rowsIn(tree).map(node => node.props.row.slug), ['beta']);
assert.deepEqual(readiness(tree), ['Selected brand1', 'Can prepare0', 'Check data1']);
const beta = rowsIn(tree)[0]; stateIndex = 0; stateValues = [];
assert.equal(children(beta.type(beta.props)).find(node => node.props['aria-label'] === 'Prepare report for Beta').props.disabled, true);
button(tree, 'Show all brands').props.onClick();
assert.equal(replaced.at(-1), '/reporting?view=library&keep=one', 'Show all clears only the brand and retains the active reporting view');

tree = render('brand=unknown&view=clients');
assert.equal(rowsIn(tree).length, 0, 'An unavailable or unauthorized requested slug cannot select an unrelated brand');
assert.deepEqual(readiness(tree), ['Selected brand0', 'Can prepare0', 'Check data0']);
assert.ok(button(tree, 'Show all brands'));
tree = render('brand=alpha', { query: 'Beta' });
assert.equal(rowsIn(tree).length, 0, 'Text filters cannot broaden a selected brand scope');
tree = render('brand=beta', { filter: 'ready' });
assert.equal(rowsIn(tree).length, 0, 'Readiness filters remain inside the chosen brand');
tree = render('brand=all');
assert.equal(rowsIn(tree).length, 3); assert.equal(button(tree, 'Show all brands'), undefined);
assert.deepEqual(readiness(tree), ['All brands3', 'Can prepare1', 'Check data2']);
tree = render('view=clients');
assert.equal(rowsIn(tree).length, 3);
console.log('PASS Reporting brand handoff: selected authorized rows, scoped readiness counts, exact compose target, unavailable-brand empty state and view-preserving Show all brands');
