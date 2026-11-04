import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const jsx = (type, props) => ({ type, props });
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const slots = []; let index = 0;
const listeners = new Map();
const react = {
  useState(initial) { const i = index++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
  useRef(initial) { const i = index++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
  useCallback(callback) { return callback; },
  useEffect(effect) { effect(); },
};
const exports = {};
const dependencies = {
  react,
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'radix-ui': { Tooltip: Object.fromEntries(['Provider', 'Root', 'Trigger', 'Portal', 'Content', 'Arrow'].map(key => [key, key])) },
  'lucide-react': { Info: 'info-icon' },
  '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
  './info-tooltip.module.css': { default: { trigger: 'trigger' } },
};
runInNewContext(ts.transpileModule(readFileSync('src/components/ui/info-tooltip.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, { exports, window: { addEventListener: (name, listener) => listeners.set(name, listener), removeEventListener: name => listeners.delete(name) }, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; } });
const render = props => { index = 0; return exports.InfoTooltip({ label: 'Recorded sales, not payment.', ...props }); };
const root = tree => nodes(tree).find(node => node.type === 'Root');
const trigger = tree => nodes(tree).find(node => node.type === 'button');
const content = tree => nodes(tree).find(node => node.type === 'Content');
const event = target => ({ prevented: false, detail: { originalEvent: { target } }, preventDefault() { this.prevented = true; } });

let tree = render();
trigger(tree).props.ref.current = { contains: target => target === 'trigger' };
assert.equal(root(tree).props.open, false);
let click = event(); trigger(tree).props.onClick(click);
tree = render(); assert.equal(root(tree).props.open, true); assert.equal(click.prevented, true, 'The primitive must not immediately close a tapped explanation');
root(tree).props.onOpenChange(false); tree = render();
assert.equal(root(tree).props.open, true, 'A touch pointer leaving after tap must not dismiss pinned copy');
const triggerOutside = event('trigger'); content(tree).props.onPointerDownOutside(triggerOutside);
assert.equal(triggerOutside.prevented, true, 'A second trigger tap is handled by its toggle rather than outside-dismiss racing it');
trigger(tree).props.onClick(event()); tree = render(); assert.equal(root(tree).props.open, false);
root(tree).props.onOpenChange(true); tree = render(); assert.equal(root(tree).props.open, true, 'Keyboard focus and pointer hover still open the tooltip');
content(tree).props.onEscapeKeyDown(); tree = render(); assert.equal(root(tree).props.open, false);
trigger(tree).props.onClick(event()); tree = render(); content(tree).props.onPointerDownOutside(event('elsewhere')); tree = render();
assert.equal(root(tree).props.open, false, 'Outside tap dismisses pinned text');
trigger(tree).props.onClick(event()); tree = render(); trigger(tree).props.onBlur(); tree = render();
assert.equal(root(tree).props.open, false, 'Tabbing away dismisses the explanation');
trigger(tree).props.onClick(event()); tree = render(); trigger(tree).props.onPointerLeave({ pointerType: 'touch' }); tree = render();
assert.equal(root(tree).props.open, true, 'Touch release keeps the text readable');
listeners.get('scroll')(); tree = render(); assert.equal(root(tree).props.open, false, 'Scrolling dismisses text instead of leaving it detached from the icon');
trigger(tree).props.onClick(event()); tree = render(); trigger(tree).props.onPointerLeave({ pointerType: 'mouse' }); tree = render();
assert.equal(root(tree).props.open, false, 'Moving to another desktop control dismisses a pinned explanation');
const link = jsx('a', { href: '/messages', children: 'Messages' });
tree = render({ children: link });
assert.equal(root(tree).props.open, undefined, 'Custom actionable children keep the existing uncontrolled tooltip behavior');
assert.equal(nodes(tree).find(node => node.type === 'Trigger').props.children, link);
assert.equal(content(tree).props.onPointerDownOutside, undefined);
console.log('PASS info tooltip: tap and keyboard toggle, persistent touch copy, second tap, Escape, outside dismissal, blur and custom-link behavior');
