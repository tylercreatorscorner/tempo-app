import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as jsx from 'react/jsx-runtime';
import ts from 'typescript';

// Execute the actual component and handlers with isolated effects and requests.
// These fixtures cannot reach Tempo or modify a real creator.
let current, fetchImpl;
const listeners = new Set();
const navigation = [];
const classes = new Proxy({}, { get: (_, key) => String(key) });
const react = {
  useState(initial) {
    const owner = current, index = owner.stateIndex++;
    if (!(index in owner.states)) owner.states[index] = typeof initial === 'function' ? initial() : initial;
    return [owner.states[index], value => { owner.states[index] = typeof value === 'function' ? value(owner.states[index]) : value; }];
  },
  useRef(initial) { const index = current.refIndex++; return current.refs[index] ??= { current: initial }; },
  useEffect(effect, deps) {
    const owner = current, index = owner.effectIndex++, previous = owner.effects[index];
    if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
      owner.pending.push(() => { previous?.cleanup?.(); owner.effects[index] = { deps, cleanup: effect() }; });
    }
  },
};
const exports = {};
const file = 'src/components/roster/creator-removal-button.tsx';
const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
runInNewContext(code, {
  exports, AbortController, encodeURIComponent, console,
  fetch: (...args) => fetchImpl(...args),
  window: { addEventListener: (name, callback) => { if (name === 'workspace-context-changed') listeners.add(callback); }, removeEventListener: (_, callback) => listeners.delete(callback) },
  require: name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return jsx;
    if (name === 'next/navigation') return { useRouter: () => ({ push: url => navigation.push(url), refresh: () => navigation.push('refresh') }) };
    if (name === 'radix-ui') return { AlertDialog: new Proxy({}, { get: (_, key) => `AlertDialog.${String(key)}` }) };
    if (name === 'lucide-react') return { Loader2: 'Loader2', Trash2: 'Trash2' };
    if (name.endsWith('.css')) return { __esModule: true, default: classes };
    throw new Error(`Unexpected dependency ${name}`);
  },
});
function harness(props) {
  const state = { states: [], refs: [], effects: [], pending: [], stateIndex: 0, refIndex: 0, effectIndex: 0 };
  return {
    render(next = props) {
      props = next; current = state; state.stateIndex = 0; state.refIndex = 0; state.effectIndex = 0;
      const tree = exports.CreatorRemovalButton(props);
      state.pending.splice(0).forEach(effect => effect());
      return tree;
    },
    dispose() { state.effects.forEach(effect => effect.cleanup?.()); },
  };
}
function nodes(tree) {
  if (tree == null || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('');
  return tree && typeof tree === 'object' ? text(tree.props?.children) : typeof tree === 'string' ? tree : '';
}
function find(tree, predicate) { const node = nodes(tree).find(predicate); assert.ok(node, 'Expected removal control missing'); return node; }
const confirm = tree => find(tree, node => node.type === 'button' && /Remove from roster|Removing…/.test(text(node)));
const flush = () => new Promise(resolve => setImmediate(resolve));
const response = (body, ok = true) => ({ ok, json: async () => body });
const base = { managedId: '42', name: 'Example Creator', brand: 'alpha', brandLabel: 'Alpha' };

for (const permission of [false, undefined, 'true']) {
  fetchImpl = async () => response({ canWrite: permission });
  const app = harness(base);
  assert.equal(app.render(), null, 'Permission is fail-closed until the request settles');
  await flush(); assert.equal(app.render(), null, 'Read-only or malformed permissions cannot expose removal');
  app.dispose();
}
fetchImpl = async () => { throw new Error('Offline'); };
const offline = harness(base); offline.render(); await flush(); assert.equal(offline.render(), null); offline.dispose();
for (const props of [{ ...base, brand: 'all' }, { ...base, brand: '' }, { ...base, managedId: 'creator-uuid' }]) {
  let count = 0; fetchImpl = async () => { count++; return response({ canWrite: true }); };
  const app = harness(props); assert.equal(app.render(), null); await flush(); assert.equal(count, 0, 'No removal across all brands or for canonical identity IDs'); app.dispose();
}

let writes = [], removed = 0, busyChanges = [], resolveWrite;
fetchImpl = async (url, init) => {
  if (init.method !== 'DELETE') return response({ canWrite: true });
  writes.push({ url, init });
  return new Promise(resolve => { resolveWrite = resolve; });
};
const props = { ...base, dirty: true, onRemoved: () => removed++, onBusyChange: value => busyChanges.push(value) };
const app = harness(props);
app.render(); await flush(); let tree = app.render();
assert.equal(tree.type, 'AlertDialog.Root');
assert.equal(tree.props.open, false);
assert.match(text(find(tree, node => node.type === 'AlertDialog.Description')), /Alpha managed-roster record/);
assert.match(text(tree), /Unsaved edits/);
tree.props.onOpenChange(true); tree = app.render();
assert.equal(tree.props.open, true); assert.equal(writes.length, 0, 'Opening confirmation cannot issue deletion');
assert.equal(find(tree, node => node.type === 'AlertDialog.Cancel').props.children, 'Cancel');
tree.props.onOpenChange(false); tree = app.render();
assert.equal(tree.props.open, false); assert.equal(writes.length, 0, 'Cancelling cannot issue deletion');
tree.props.onOpenChange(true); tree = app.render();
const pendingClick = confirm(tree).props.onClick;
pendingClick(); pendingClick(); await flush(); tree = app.render();
assert.equal(writes.length, 1, 'Double clicks cannot duplicate an archive request');
assert.equal(writes[0].url, '/api/roster/42?brand=alpha', 'Removal targets the visible brand and roster row');
assert.equal(find(tree, node => node.type === 'AlertDialog.Cancel').props.disabled, true);
assert.equal(confirm(tree).props.disabled, true);
tree.props.onOpenChange(false); assert.equal(app.render().props.open, true, 'Do not dismiss a request with an unresolved result');
let escaped = false;
find(tree, node => node.type === 'AlertDialog.Content').props.onEscapeKeyDown({ preventDefault() { escaped = true; } });
assert.equal(escaped, true);
resolveWrite(response({ error: 'This creator changed. Refresh and try again.' }, false)); await flush(); tree = app.render();
assert.equal(removed, 0); assert.equal(tree.props.open, true);
assert.match(text(find(tree, node => node.props?.role === 'alert')), /Refresh and try again/);
assert.equal(confirm(tree).props.disabled, false);

// A login redirect or malformed success page must not clear the creator row.
confirm(tree).props.onClick(); await flush(); resolveWrite({ ok: true, json: async () => { throw new Error('HTML'); } }); await flush(); tree = app.render();
assert.equal(removed, 0); assert.equal(tree.props.open, true);
assert.ok(find(tree, node => node.props?.role === 'alert'));
confirm(tree).props.onClick(); await flush(); resolveWrite(response({ ok: true })); await flush(); tree = app.render();
assert.equal(removed, 1); assert.equal(tree.props.open, false);
assert.deepEqual(busyChanges, [true, false, true, false, true, false]);
app.dispose();

fetchImpl = async () => response({ canWrite: true });
const disabled = harness({ ...base, disabled: true }); disabled.render(); await flush(); tree = disabled.render();
assert.equal(confirm(tree).props.disabled, true);
let disabledWrites = 0; fetchImpl = async () => { disabledWrites++; return response({ ok: true }); };
confirm(tree).props.onClick(); await flush(); assert.equal(disabledWrites, 0); disabled.dispose();

let oldPermission;
fetchImpl = (url, init) => url.endsWith('brand=alpha') ? new Promise(resolve => { oldPermission = { resolve, signal: init.signal }; }) : Promise.resolve(response({ canWrite: false }));
const switching = harness(base); switching.render();
assert.equal(switching.render({ ...base, brand: 'beta', brandLabel: 'Beta' }), null);
assert.equal(oldPermission.signal.aborted, true, 'Old permission lookup is cancelled after a brand change');
oldPermission.resolve(response({ canWrite: true })); await flush(); assert.equal(switching.render(), null, 'A late old-brand result cannot authorize the new brand'); switching.dispose();

fetchImpl = async () => response({ canWrite: true });
const workspace = harness(base); workspace.render(); await flush(); tree = workspace.render(); tree.props.onOpenChange(true); tree = workspace.render();
assert.equal(tree.props.open, true);
fetchImpl = async () => response({ canWrite: false });
for (const callback of listeners) callback();
assert.equal(workspace.render(), null, 'Workspace changes immediately revoke the previous permission state');
await flush(); assert.equal(workspace.render(), null); workspace.dispose();

// A successful reply from an old workspace must not close a new editor or
// navigate the user back into that workspace after they have switched away.
for (const invalidation of ['workspace', 'unmount']) {
  let finish, callbacks = 0;
  const busy = [];
  fetchImpl = async (_, init) => init.method === 'DELETE'
    ? new Promise(resolve => { finish = resolve; }) : response({ canWrite: true });
  const pending = harness({ ...base, onRemoved: () => callbacks++, onBusyChange: value => busy.push(value) });
  pending.render(); await flush(); tree = pending.render(); tree.props.onOpenChange(true); tree = pending.render();
  confirm(tree).props.onClick(); await flush();
  if (invalidation === 'workspace') {
    for (const callback of listeners) callback();
    assert.equal(pending.render(), null);
  } else pending.dispose();
  const busyBeforeReply = [...busy];
  finish(response({ ok: true })); await flush();
  assert.equal(callbacks, 0, `A stale ${invalidation} response cannot call removal success`);
  assert.deepEqual(busy, busyBeforeReply, 'Stale requests cannot update a replacement editor');
  assert.equal(navigation.length, 0);
  if (invalidation === 'workspace') pending.dispose();
}

fetchImpl = async (_, init) => response(init.method === 'DELETE' ? { ok: true } : { canWrite: true });
const profile = harness(base); profile.render(); await flush(); tree = profile.render(); tree.props.onOpenChange(true); tree = profile.render();
confirm(tree).props.onClick(); await flush();
assert.deepEqual(navigation, ['/roster?brand=alpha', 'refresh'], 'Profile removal returns to the same brand roster after confirmed success');
profile.dispose();
assert.equal(listeners.size, 0, 'Workspace listeners are cleaned up on unmount');
console.log('PASS creator removal interactions: permission fail-closed, brand scope, cancel, draft warning, duplicate prevention, errors and retry, real success, disabled state and stale permission cancellation');
