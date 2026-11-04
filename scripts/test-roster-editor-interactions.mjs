import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as jsx from 'react/jsx-runtime';
import ts from 'typescript';

const classes = new Proxy({}, { get: (_, name) => String(name) });
const nil = () => null;
let currentContext, fetchImpl;
const focusTarget = { isConnected: true, focus() {} };
class Element {}
Object.setPrototypeOf(focusTarget, Element.prototype);
const document = { activeElement: focusTarget };
let hook;
const react = {
  createContext: () => ({ Provider: 'ContextProvider' }), useContext: () => currentContext,
  useState: initial => { const index = hook.stateIndex++; if (!(index in hook.states)) hook.states[index] = typeof initial === 'function' ? initial() : initial; return [hook.states[index], next => { hook.states[index] = typeof next === 'function' ? next(hook.states[index]) : next; }]; },
  useRef: initial => { const index = hook.refIndex++; return hook.refs[index] ??= { current: initial }; },
  useEffect: () => {}, useMemo: fn => fn(), useCallback: fn => fn, useId: () => 'roster-editor-fixture',
};
const dependency = {
  react, 'react/jsx-runtime': jsx,
  'radix-ui': { Dialog: new Proxy({}, { get: (_, key) => `Dialog.${String(key)}` }), AlertDialog: new Proxy({}, { get: (_, key) => `AlertDialog.${String(key)}` }) },
  '@/components/ui/button': { Button: 'Button' }, '@/components/ui/input': { Input: 'Input' },
  '@/components/ui/choice-menu': { ChoiceMenu: 'ChoiceMenu' }, '@/components/ui/search-input': { SearchInput: 'SearchInput' },
  '@/hooks/use-brand-list': { useBrandList: () => ({ brands: [{ slug: 'alpha', name: 'Alpha' }] }) },
  '@/hooks/use-brand-meta': { useBrandMeta: () => ({ label: value => value }) },
};
function load(file, extra = '') {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8') + extra, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  runInNewContext(code, { exports, document, HTMLElement: Element, Intl, Number, Date, URL, URLSearchParams, Set, Map, console, fetch: (...args) => fetchImpl(...args), require: name => name.endsWith('.css') ? { default: classes, __esModule: true } : dependency[name] ?? new Proxy({}, { get: (_, key) => key === '__esModule' ? true : nil }) });
  return exports;
}
function harness(component, props) {
  const state = { states: [], refs: [], stateIndex: 0, refIndex: 0 };
  return { state, render(next = props) { hook = state; state.stateIndex = 0; state.refIndex = 0; return component(next); } };
}
function nodes(root) {
  if (root == null || typeof root !== 'object') return [];
  if (Array.isArray(root)) return root.flatMap(nodes);
  return [root, ...nodes(root.props?.children)];
}
const find = (tree, predicate) => { const value = nodes(tree).find(predicate); assert.ok(value, 'Expected control missing'); return value; };
const flush = () => new Promise(resolve => setImmediate(resolve));
const terms = load('src/components/roster/editor-values.ts');
dependency['@/components/roster/editor-values'] = terms;
assert.equal(JSON.stringify(terms.changedRosterTerms({ retainer: '', monthly_post_requirement: '' }, { retainer: null, monthly_post_requirement: null })), '{}');
assert.equal(JSON.stringify(terms.changedRosterTerms({ retainer: '1000', monthly_post_requirement: '20' }, { retainer: 1000, monthly_post_requirement: 20 })), '{}');
assert.equal(JSON.stringify(terms.changedRosterTerms({ retainer: '0', monthly_post_requirement: '0' }, { retainer: null, monthly_post_requirement: null })), '{"retainer":0,"monthly_post_requirement":0}');
assert.equal(JSON.stringify(terms.changedRosterTerms({ retainer: '', monthly_post_requirement: '' }, { retainer: 1000, monthly_post_requirement: 20 })), '{"retainer":null,"monthly_post_requirement":null}');
for (const [retainer, target] of [['-1', '20'], ['Infinity', '20'], ['1000', '1.5'], ['1000', '201']]) assert.throws(() => terms.changedRosterTerms({ retainer, monthly_post_requirement: target }, { retainer: null, monthly_post_requirement: null }));

const tagModel = load('src/lib/roster/creator-tags.ts');
dependency['@/lib/roster/creator-tags'] = tagModel;
const { __Session: Session } = load('src/components/roster/studio-tag-controls.tsx', '\nexport { TagEditorSession as __Session };');
let reloaded = 0, changed = 0, saved = 0, closed = 0, requests = [];
currentContext = { brand: 'alpha', tags: ['elite'], canWrite: true, loading: false, reload: () => reloaded++ };
const session = harness(Session, { ids: ['1', '2'], onChanged: () => changed++, onSaved: () => saved++, onOpenChange: open => { if (!open) closed++; } });
let tree = session.render();
find(tree, node => node.type === 'Input').props.onChange({ target: { value: 'elite' } });
tree = session.render();
fetchImpl = async (url, init) => { requests.push({ url, body: JSON.parse(init.body) }); return { ok: false, json: async () => ({ updated: [1], failed: [2], error: 'Conflict' }) }; };
find(tree, node => node.type === 'Button' && node.props.children === 'Save tag').props.onClick(); await flush();
tree = session.render();
assert.equal(saved, 0, 'Partial failure must not call the success callback that closes the parent editor');
assert.equal(closed, 0); assert.equal(changed, 1); assert.equal(reloaded, 1);
assert.ok(nodes(tree).some(node => node.props?.role === 'alert' && node.props.children.includes('1 of 2 creators saved')), 'Partial result is actionable and remains visible');
assert.equal(find(tree, node => node.type === 'Input').props.value, 'elite', 'Failed/partial writes preserve the draft');
fetchImpl = async (url, init) => { requests.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({ updated: [1, 2], failed: [] }) }; };
find(tree, node => node.type === 'Button' && node.props.children === 'Save tag').props.onClick(); await flush();
assert.equal(saved, 1); assert.equal(closed, 1); assert.equal(changed, 2);
assert.equal(JSON.stringify(requests[0].body), JSON.stringify(requests[1].body), 'A partial save can safely retry the same additive command');

dependency['@/components/roster/roster-form-dialog'] = { RosterFormDialog: 'RosterFormDialog', RosterFormClose: 'RosterFormClose' };
const { __Panel: Panel, __Add: Add } = load('src/app/(admin)/roster/page.tsx', '\nexport { CreatorPanel as __Panel, AddCreatorModal as __Add };');
const creator = { id: '1', real_name: 'Original', brand: 'alpha', status: null, retainer: null, monthly_post_requirement: null, handles: ['first'], product_tags: [{ key: 'one' }], is_managed: true };
let writes = [], editSaved = 0;
const panel = harness(Panel, { creator, onClose: nil, onSaved: () => editSaved++, onRemoved: nil });
tree = panel.render();
const inputs = nodes(tree).filter(node => node.type === 'input' || node.type === 'textarea');
const labels = new Set(nodes(tree).filter(node => node.type === 'label').map(node => node.props.htmlFor));
assert.ok(inputs.every(node => node.props['aria-label'] || labels.has(node.props.id)), 'Every roster edit field has an accessible name');
find(tree, node => node.type === 'input' && node.props.id?.endsWith('-real_name')).props.onChange({ target: { value: 'Updated' } });
tree = panel.render();
assert.equal(tree.props.dirty, true, 'Changing identity requires discard confirmation before closing');
fetchImpl = async (url, init) => { writes.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ data: { ...creator, real_name: 'Updated' } }) }; };
find(tree, node => node.type === 'button' && node.props.onClick && Array.isArray(node.props.children) && node.props.children.includes('Save')).props.onClick(); await flush();
assert.equal(editSaved, 1); assert.equal(writes[0].real_name, 'Updated');
assert.equal('retainer' in writes[0], false, 'Identity-only saves cannot invent a zero fee');
assert.equal('monthly_post_requirement' in writes[0], false, 'Identity-only saves cannot invent a 30-post target');
assert.equal(writes[0].status, null, 'Missing status is not silently changed to Active');
const add = harness(Add, { prefill: { brand: 'alpha' }, onClose: nil, onSuccess: nil });
tree = add.render();
assert.equal(tree.props.title, 'Add creator'); assert.equal(tree.props.dirty, false);
const addLabels = new Set(nodes(tree).filter(node => node.type === 'label').map(node => node.props.htmlFor));
assert.ok(nodes(tree).filter(node => node.type === 'input' || node.type === 'textarea').every(node => node.props['aria-label'] || addLabels.has(node.props.id)), 'Every add-creator field has an accessible name');
const forms = nodes(tree).filter(node => node.type === 'form');
writes = [];
forms[0].props.onSubmit({ preventDefault() {} }); await flush();
assert.equal(writes.length, 0, 'Blank creator validation cannot post a real record');

const { RosterFormDialog } = load('src/components/roster/roster-form-dialog.tsx');
let closeCount = 0;
const dialog = harness(RosterFormDialog, { title: 'Test', description: 'Test form', children: null, busy: false, dirty: true, onClose: () => closeCount++ });
tree = dialog.render();
let prevented = false;
find(tree, node => node.type === 'Dialog.Content').props.onEscapeKeyDown({ preventDefault() { prevented = true; } });
tree = dialog.render();
assert.equal(prevented, true); assert.equal(closeCount, 0);
assert.equal(find(tree, node => node.type === 'AlertDialog.Root').props.open, true, 'Escape protects unsaved form values');
find(tree, node => node.type === 'AlertDialog.Action').props.onClick();
assert.equal(closeCount, 1, 'Explicit discard closes the form');
const busyDialog = harness(RosterFormDialog, { title: 'Busy', description: 'Saving', children: null, busy: true, dirty: true, onClose: () => closeCount++ });
tree = busyDialog.render();
find(tree, node => node.type === 'Dialog.Content').props.onEscapeKeyDown({ preventDefault() {} });
assert.equal(closeCount, 1, 'Saving prevents dismissal while the result is unresolved');
console.log('PASS roster editor interactions: partial tag feedback/retry, draft preservation, real identity-only payload, nullable terms, numeric validation, named fields, unsaved Escape/discard and in-flight close guards');
