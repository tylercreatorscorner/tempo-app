import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as jsx from 'react/jsx-runtime';
import ts from 'typescript';

// Execute the real component handlers/effects with controlled requests. These
// tests exercise state races; they do not claim browser layout or native form QA.
// Every fetch is intercepted here, with no network or business-record writes.
let active;
let routeCode = 'fixture_alpha';
const requests = [];
const focused = [];
const react = {
  useState(initial) {
    const owner = active, index = owner.index++;
    if (!(index in owner.slots)) owner.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [owner.slots[index], value => {
      if (owner.closed) owner.writesAfterClose++;
      owner.slots[index] = typeof value === 'function' ? value(owner.slots[index]) : value;
    }];
  },
  useRef(initial) { return active.slots[active.index++] ??= { current: initial }; },
  useEffect(effect, deps) {
    const owner = active, index = owner.index++, previous = owner.slots[index];
    if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
      owner.pending.push(() => {
        previous?.cleanup?.();
        owner.slots[index] = { deps, cleanup: effect() };
      });
    }
  },
};
const exports = {};
const code = ts.transpileModule(readFileSync('src/app/join/[code]/page.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const dependencies = {
  react,
  'react/jsx-runtime': jsx,
  'next/navigation': { useParams: () => ({ code: routeCode }) },
  '@/components/ui/button': { Button: 'Button' },
  '@/components/ui/input': { Input: 'Input' },
  '@/components/ui/navigation-link': { NavigationLink: 'NavigationLink' },
  '@/components/ui/tempo-logo': { TempoLogo: 'TempoLogo' },
};
runInNewContext(code, {
  exports, AbortController,
  fetch(url, init = {}) {
    return new Promise((resolve, reject) => requests.push({ url, init, resolve, reject }));
  },
  require: name => name.endsWith('.css')
    ? { __esModule: true, default: { theme: 'theme', entry: 'entry', entryCard: 'entryCard' } }
    : dependencies[name] ?? new Proxy({}, { get: (_, key) => key === '__esModule' ? true : String(key) }),
});

const nodes = root => !root || typeof root !== 'object' ? [] : Array.isArray(root) ? root.flatMap(nodes) : [root, ...nodes(root.props?.children)];
const text = root => root == null || typeof root === 'boolean' ? '' : typeof root !== 'object' ? String(root) : Array.isArray(root) ? root.map(text).join(' ') : text(root.props?.children);
const find = (tree, predicate) => {
  const node = nodes(tree).find(predicate);
  assert.ok(node, 'Expected control exists');
  return node;
};
const button = (tree, label) => find(tree, node => ['button', 'Button'].includes(node.type) && (node.props['aria-label'] === label || text(node).trim() === label));
const input = (tree, id) => find(tree, node => node.type === 'Input' && node.props.id === id);
const form = tree => find(tree, node => node.type === 'form');
const event = { preventDefault() {} };
const flush = () => new Promise(resolve => setImmediate(resolve));
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const invite = name => ({ brand: name.toLowerCase(), brand_display_name: name });

function harness(Component, props) {
  const state = { index: 0, slots: [], pending: [], closed: false, writesAfterClose: 0 };
  return {
    state,
    render() {
      active = state;
      state.index = 0;
      state.pending = [];
      const tree = Component(props);
      for (const node of nodes(tree)) {
        if (node.props?.ref && typeof node.props.ref === 'object') {
          node.props.ref.current = { focus: () => focused.push(text(node).trim()) };
        }
      }
      state.pending.forEach(effect => effect());
      return tree;
    },
    close() {
      state.closed = true;
      state.slots.forEach(slot => slot?.cleanup?.());
    },
  };
}

function routeHarness() {
  let child, key;
  const oldChildren = [];
  return {
    render(nextCode = routeCode) {
      routeCode = nextCode;
      const element = exports.default();
      if (element.key !== key) {
        if (child) { child.close(); oldChildren.push(child); }
        key = element.key;
        child = harness(element.type, element.props);
      }
      return child.render();
    },
    close() { child.close(); },
    get oldChildren() { return oldChildren; },
    get child() { return child; },
  };
}

function enterDetails(page) {
  let tree = page.render();
  input(tree, 'join-name').props.onChange({ target: { value: 'Fixture Creator' } });
  input(tree, 'join-email').props.onChange({ target: { value: 'creator@fixture.invalid' } });
  tree = page.render();
  form(tree).props.onSubmit(event);
  tree = page.render();
  input(tree, 'join-handle-0').props.onChange({ target: { value: '@Fixture.Creator' } });
  return page.render();
}

// A code change unmounts/reset the form before new data is available, aborts
// the old validation, and ignores late results even if fetch ignores abort.
const page = routeHarness();
let tree = page.render('fixture_alpha');
assert.match(text(tree), /Checking invitation/);
assert.ok(find(tree, node => node.props.role === 'status'));
const alpha = requests.at(-1);
assert.equal(alpha.url, '/api/invites/fixture_alpha');
tree = page.render('fixture_beta');
const beta = requests.at(-1);
assert.equal(alpha.init.signal.aborted, true);
beta.resolve(response(invite('Beta')));
await flush();
tree = page.render();
assert.match(text(tree), /Joining\s+Beta/);
assert.equal(focused.at(-1), 'Tell us about yourself');
alpha.resolve(response(invite('Alpha')));
await flush();
assert.doesNotMatch(text(page.render()), /Alpha/);
assert.equal(page.oldChildren[0].state.writesAfterClose, 0);

// Same-tick duplicate submit invokes one POST. The existing handlers cannot
// edit accounts, add/remove accounts, or navigate Back while it is pending.
tree = enterDetails(page);
assert.equal(focused.at(-1), 'Add your TikTok accounts');
button(tree, 'Add another account').props.onClick();
tree = page.render();
input(tree, 'join-handle-1').props.onChange({ target: { value: 'Second.Creator' } });
tree = page.render();
const oldForm = form(tree), oldBack = button(tree, 'Back'), oldAdd = button(tree, 'Add another account');
const oldRemove = button(tree, 'Remove TikTok account 1'), oldInput = input(tree, 'join-handle-0');
const submitted = oldForm.props.onSubmit(event);
await oldForm.props.onSubmit(event);
assert.equal(requests.filter(request => request.url === '/api/join').length, 1);
const post = requests.at(-1);
assert.deepEqual(JSON.parse(post.init.body), {
  code: 'fixture_beta', name: 'Fixture Creator', email: 'creator@fixture.invalid',
  tiktok_usernames: ['fixture.creator', 'second.creator'],
});
oldBack.props.onClick();
oldAdd.props.onClick();
oldRemove.props.onClick();
oldInput.props.onChange({ target: { value: 'changed.while.pending' } });
tree = page.render();
assert.equal(find(tree, node => node.type === 'fieldset').props.disabled, true);
assert.equal(button(tree, 'Back').props.disabled, true);
assert.equal(input(tree, 'join-handle-0').props.value, 'Fixture.Creator');
assert.equal(nodes(tree).filter(node => node.type === 'Input').length, 2);
assert.match(text(find(tree, node => node.props.role === 'status')), /Submitting your details/);

// Conflict retains form and announces/focuses the error. Retry clears it before
// waiting. HTTP failure may never become success even with success:true JSON.
const conflict = 'This information needs to be verified by your brand manager. No existing creator account was changed.';
post.resolve(response({ error: conflict }, 409));
await submitted;
tree = page.render();
assert.equal(text(find(tree, node => node.props.role === 'alert')), conflict);
assert.equal(focused.at(-1), conflict);
assert.equal(find(tree, node => node.type === 'fieldset').props.disabled, false);
let retry = form(tree).props.onSubmit(event);
tree = page.render();
assert.equal(nodes(tree).filter(node => node.props.role === 'alert').length, 0);
requests.at(-1).resolve(response({ success: true }, 503));
await retry;
tree = page.render();
assert.doesNotMatch(text(tree), /Details received/);
assert.match(text(find(tree, node => node.props.role === 'alert')), /could not save/);

// A malformed 200 response is not success. An explicit successful result is
// still pending brand review, never a claim of identity verification or email.
retry = form(tree).props.onSubmit(event);
requests.at(-1).resolve(response({}));
await retry;
tree = page.render();
assert.match(text(find(tree, node => node.props.role === 'alert')), /could not confirm/);
retry = form(tree).props.onSubmit(event);
requests.at(-1).resolve(response({ success: true, verified: false, verified_usernames: [] }));
await retry;
tree = page.render();
assert.match(text(tree), /Details received/);
assert.match(text(tree), /review is still pending/);
assert.doesNotMatch(text(tree), /Check your email|notify you by email|account has been verified|You are in/);
assert.equal(focused.at(-1), 'Details received');

// Switching to a new code removes a completed result and all contact fields.
tree = page.render('fixture_gamma');
assert.match(text(tree), /Checking invitation/);
assert.doesNotMatch(text(tree), /Beta|Details received/);
requests.at(-1).resolve(response(invite('Gamma')));
await flush();
tree = page.render();
assert.equal(input(tree, 'join-name').props.value, '');
assert.equal(input(tree, 'join-email').props.value, '');
tree = enterDetails(page);
const maxAdd = button(tree, 'Add another account');
for (let index = 0; index < 20; index++) maxAdd.props.onClick();
tree = page.render();
assert.equal(nodes(tree).filter(node => node.type === 'Input').length, 10);
assert.equal(button(tree, 'Add another account').props.disabled, true);
const departingSubmit = form(tree).props.onSubmit(event);
const departingRequest = requests.at(-1);
tree = page.render('fixture_delta');
departingRequest.resolve(response({ success: true }));
await departingSubmit;
assert.match(text(page.render()), /Checking invitation/);
assert.equal(page.oldChildren.at(-1).state.writesAfterClose, 0);

// Retry transient validation failures. Permanent expired links have clear
// manager guidance and no retry loop. Failed/malformed validation never opens
// the form. Retry cleanup also aborts the prior request signal.
const delta = requests.at(-1);
delta.reject(new Error('fixture offline'));
await flush();
tree = page.render();
assert.match(text(tree), /Invitation unavailable/);
button(tree, 'Try again').props.onClick();
tree = page.render();
assert.equal(delta.init.signal.aborted, true);
assert.match(text(tree), /Checking invitation/);
requests.at(-1).resolve(response({ brand: 'delta' }));
await flush();
tree = page.render();
assert.equal(nodes(tree).filter(node => node.type === 'form').length, 0);
button(tree, 'Try again').props.onClick();
page.render();
requests.at(-1).resolve(response({ error: 'This invite has expired' }, 410));
await flush();
tree = page.render();
assert.match(text(tree), /Ask your brand manager for a new invitation link/);
assert.equal(nodes(tree).filter(node => node.type === 'Button' && text(node) === 'Try again').length, 0);

// Closing the page prevents even an abort-ignoring completion from writing state.
page.render('fixture_epsilon');
const lastValidation = requests.at(-1);
page.close();
assert.equal(lastValidation.init.signal.aborted, true);
lastValidation.resolve(response(invite('Epsilon')));
await flush();
assert.equal(page.child.state.writesAfterClose, 0);

console.log('Join interaction tests passed: stale validation, code reset, submit lock, pending controls, response integrity, truthful success, retry, account limits, focus, and unmount cleanup. No live requests.');
