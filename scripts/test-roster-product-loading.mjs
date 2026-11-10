import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as jsx from 'react/jsx-runtime';
import ts from 'typescript';

let current;
const timers = new Map();
let timerId = 0;
const requests = [];
const react = {
  useState(initial) {
    const index = current.stateIndex++;
    if (!(index in current.states)) current.states[index] = initial;
    const context = current;
    return [context.states[index], next => { context.states[index] = typeof next === 'function' ? next(context.states[index]) : next; }];
  },
  useEffect(effect, deps) {
    const index = current.effectIndex++;
    const previous = current.effects[index];
    if (!previous || deps.some((value, position) => value !== previous.deps[position])) current.pending.push({ index, effect, deps });
  },
  useMemo(factory, deps) {
    const index = current.memoIndex++;
    const previous = current.memos[index];
    if (!previous || deps.some((value, position) => value !== previous.deps[position])) current.memos[index] = { deps, value: factory() };
    return current.memos[index].value;
  },
};
const source = ts.transpileModule(readFileSync('src/components/roster/product-tag-picker.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exports = {};
runInNewContext(source, {
  exports, AbortController, encodeURIComponent,
  setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
  clearTimeout(id) { timers.delete(id); },
  fetch(url, init) { return new Promise(resolve => { requests.push({ url, signal: init.signal, resolve }); }); },
  require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return jsx;
    if (name === 'lucide-react') return { Check: 'Check' };
    if (name.endsWith('/button')) return { Button: 'Button' };
    if (name.endsWith('/select')) return { Select: 'Select' };
    throw new Error(`Unexpected module: ${name}`);
  },
});
function harness(component, props) {
  const context = { states: [], effects: [], pending: [], memos: [], stateIndex: 0, effectIndex: 0, memoIndex: 0 };
  return {
    render(next = props) { current = context; context.stateIndex = 0; context.effectIndex = 0; context.memoIndex = 0; return component(next); },
    effects() {
      for (const { index, effect, deps } of context.pending.splice(0)) {
        context.effects[index]?.cleanup?.();
        context.effects[index] = { deps, cleanup: effect() };
      }
    },
    unmount() { context.effects.forEach(effect => effect?.cleanup?.()); },
  };
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join(' ');
  if (tree && typeof tree === 'object') return text(tree.props?.children);
  return tree == null ? '' : String(tree);
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const response = products => ({ ok: true, json: async () => ({ products }) });
const product = (key, status = 'active') => ({ product_key: key, display_name: key.toUpperCase(), status });
const changes = [];
const alpha = { brand: 'alpha', value: ['saved', 'alpha-one'], onChange: value => changes.push(value) };
const picker = harness(exports.ProductTagPicker, alpha);
let tree = picker.render();
assert.equal(tree.props.role, 'status');
picker.effects();
assert.equal(requests.length, 1);
const first = requests[0];
[...timers.values()][0]();
assert.equal(first.signal.aborted, true, 'Stalled requests are aborted after the timeout');
tree = picker.render();
const error = nodes(tree).find(node => typeof node.type === 'function');
assert.ok(error?.props.message.includes('too long'), 'Timeout offers an explicit retryable error');
assert.equal(error.props.selected, true, 'Saved selections are acknowledged while catalog loading fails');
assert.equal(nodes(tree).some(node => node.props?.children?.includes?.('No catalog products')), false);
first.resolve(response([product('late-alpha')])); await flush();
tree = picker.render();
assert.ok(tree.props.message.includes('too long'), 'A late result cannot overwrite the timed-out state');
tree.props.retry(); picker.render(); picker.effects(); tree = picker.render();
assert.equal(tree.props.role, 'status');
assert.equal(nodes(tree).some(node => node.type === 'Button'), false, 'Product toggles are unavailable until current-brand loading succeeds');
requests.at(-1).resolve(response([product('alpha-one'), product('old-alpha', 'archived')])); await flush();
tree = picker.render();
const toggle = nodes(tree).find(node => node.type === 'Button');
assert.equal(toggle.props['aria-pressed'], true);
assert.equal(nodes(tree).filter(node => node.type === 'Button').length, 1, 'Archived products cannot be newly selected');
assert.equal(changes.length, 0, 'Timeout, retry and successful load never clear selected draft keys');
toggle.props.onClick();
assert.equal(JSON.stringify(changes), JSON.stringify([['saved']]), 'An explicit toggle preserves other saved keys');

const beta = { ...alpha, brand: 'beta' };
tree = picker.render(beta);
assert.equal(tree.props.role, 'status', 'Previous-brand controls disappear before the new effect runs');
picker.effects();
assert.equal(requests[1].signal.aborted, true, 'Brand changes clean up the earlier request');
requests.at(-1).resolve({ ok: false, status: 403 }); await flush();
tree = picker.render(beta);
assert.ok(tree.props.message.includes('access'), 'Forbidden is an error, never a false empty catalog');
tree.props.retry(); picker.render(beta); picker.effects();
requests.at(-1).resolve(response([])); await flush();
tree = picker.render(beta);
assert.ok(text(tree).includes('No catalog products'), 'Only a confirmed successful empty response displays the empty state');
picker.unmount();

const filter = harness(exports.ProductFilterSelect, { brand: 'alpha', value: 'saved', onChange: () => { throw new Error('Loading must not clear an active filter'); } });
tree = filter.render(); filter.effects();
assert.equal(tree.props.role, 'status');
requests.at(-1).resolve({ ok: false, status: 500 }); await flush();
tree = filter.render();
assert.ok(tree.props.message.includes('could not be loaded'), 'Filter failures remain visible and retryable');
tree.props.retry(); filter.render(); filter.effects();
requests.at(-1).resolve({ ok: true, json: async () => ({}) }); await flush();
tree = filter.render();
assert.ok(tree.props.message.includes('could not be read'), 'Malformed responses remain errors instead of false empty catalogs');
filter.unmount();
assert.equal(timers.size, 0, 'Settled/unmounted loads release all timeout timers');
console.log('PASS roster product loading: bounded abort, retry, late/stale result protection, preserved selections, access and malformed errors, confirmed empty state, disabled pending toggles and filter parity');
