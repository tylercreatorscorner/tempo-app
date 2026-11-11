import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as jsx from 'react/jsx-runtime';
import ts from 'typescript';

// Exercise actual component handlers against controlled responses. No live API calls.
let active, fetchImpl, clipboardImpl, query = 'tab=templates&brand=example', lastUrl;
const intervals = new Set();
const timers = new Map();
let timerId = 0;
const changed = (prior, deps) => !prior || !deps || deps.some((value, i) => !Object.is(value, prior.deps[i]));
const react = {
  useState(initial) {
    const owner = active, i = owner.index++;
    if (!(i in owner.slots)) owner.slots[i] = typeof initial === 'function' ? initial() : initial;
    return [owner.slots[i], value => { owner.slots[i] = typeof value === 'function' ? value(owner.slots[i]) : value; }];
  },
  useRef(initial) { return active.slots[active.index++] ??= { current: initial }; },
  useMemo(callback, deps) {
    const i = active.index++;
    if (changed(active.slots[i], deps)) active.slots[i] = { deps, value: callback() };
    return active.slots[i].value;
  },
  useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
  useEffect(effect, deps) {
    const owner = active, i = owner.index++, previous = owner.slots[i];
    if (changed(previous, deps)) owner.pending.push(() => { previous?.cleanup?.(); owner.slots[i] = { deps, cleanup: effect() }; });
  },
  Suspense: 'Suspense',
};
const dependencies = {
  react, 'react/jsx-runtime': jsx,
  'next/link': { default: 'Link', __esModule: true },
  'next/navigation': { useRouter: () => ({ replace: url => { lastUrl = url; } }), usePathname: () => '/messages', useSearchParams: () => new URLSearchParams(query) },
  '@/components/ui/page-header': { PageHeader: 'PageHeader' },
  '@/components/ui/button': { Button: 'Button', buttonVariants: () => '' },
  '@/components/ui/segmented': { SegmentedControl: 'SegmentedControl' },
  '@/components/ui/choice-menu': { ChoiceMenu: 'ChoiceMenu' },
  '@/components/messages/broadcasts-tab': { BroadcastsTab: 'BroadcastsTab' },
  '@/components/messages/templates-tab': { TemplatesTab: 'TemplatesTab' },
  '@/components/messages/inbox-tab': { InboxTab: 'InboxTab' },
  '@/components/messages/conversation-list': { convKey: c => c.discord_user_id || `creator:${c.creator_id}` },
  './conversation-list': { ConversationList: 'ConversationList', convKey: c => c.discord_user_id || `creator:${c.creator_id}` },
  './chat-thread': { ChatThread: 'ChatThread' },
  '@/hooks/use-tenant': { useTenant: () => ({ tenant: { discord_connected: true } }) },
  '@/hooks/use-brand-meta': { useBrandMeta: () => ({ label: value => value, color: () => '#666' }) },
  '@/hooks/use-brand-list': { useBrandList: () => ({ brands: [] }) },
  '@/lib/utils': { cn: (...items) => items.filter(Boolean).join(' ') },
  '@/lib/messages/channels': { getChannelConfig: () => ({ label: 'Discord DM' }) },
  '@/lib/messages/classify-topic': { TOPIC_LABELS: {}, TOPIC_COLORS: {}, MESSAGE_TOPICS: [] },
  '@/lib/data/creator-status': { STATUS_CONFIG: {}, ALL_STATUSES: [], getStatusInfo: () => ({}) },
  '@/lib/coaching/model': { sundayToday: () => '2026-11-08', coachingWeeks: () => [], blankDraft: () => ({ entries: {}, summary: '', blockers: '' }), validWeek: () => true },
};
let confirmResult = false, confirmCalls = 0;
const documentListeners = new Map(), windowListeners = new Map();
const events = listeners => ({
  addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback); },
  removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
});
class FixtureElement {
  constructor(anchor) { this.anchor = anchor; }
  closest() { return this.anchor; }
}
function anchorClick(href, options = {}) {
  const anchor = { href, target: options.target ?? '', hasAttribute: name => name === 'download' && Boolean(options.download) };
  const event = { button: 0, defaultPrevented: false, target: new FixtureElement(anchor), preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...options.event };
  for (const handler of documentListeners.get('click') ?? []) handler(event);
  return event;
}
function load(file) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  runInNewContext(code, {
    exports, URL, URLSearchParams, Date, Intl, Map, AbortController, Element: FixtureElement,
    window: { location: { origin: 'https://fixture.invalid', href: 'https://fixture.invalid/reporting/coaching' }, confirm: () => { confirmCalls++; return confirmResult; }, ...events(windowListeners) },
    document: { hidden: false, ...events(documentListeners) },
    navigator: { clipboard: { writeText: value => clipboardImpl(value) } },
    fetch: (...args) => fetchImpl(...args),
    setInterval: callback => { intervals.add(callback); return callback; }, clearInterval: callback => intervals.delete(callback),
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; }, clearTimeout: id => timers.delete(id),
    require: name => name.endsWith('.css') ? { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) } : dependencies[name] ?? new Proxy({}, { get: (_, key) => key === '__esModule' ? true : String(key) }),
  });
  return exports;
}
function harness(Component, props) {
  const state = { index: 0, slots: [], pending: [] };
  return {
    render() { active = state; state.index = 0; state.pending = []; const tree = Component(props); state.pending.forEach(effect => effect()); return tree; },
    close() { state.slots.forEach(slot => slot?.cleanup?.()); },
  };
}
function nodes(root) { return !root || typeof root !== 'object' ? [] : Array.isArray(root) ? root.flatMap(nodes) : [root, ...nodes(root.props?.children)]; }
const find = (tree, predicate) => { const node = nodes(tree).find(predicate); assert.ok(node, 'Expected control exists'); return node; };
const text = root => root == null || typeof root === 'boolean' ? '' : typeof root !== 'object' ? String(root) : Array.isArray(root) ? root.map(text).join(' ') : text(root.props?.children);
const button = (tree, name) => find(tree, node => ['button', 'Button'].includes(node.type) && (node.props['aria-label'] === name || text(node).trim() === name));
const flush = () => new Promise(resolve => setImmediate(resolve));
const response = (body, ok = true) => ({ ok, json: async () => body });

fetchImpl = async () => response({ conversations: [] });
const legacy = load('src/app/(admin)/messages/legacy-hub.tsx').default();
const hub = harness(legacy.props.children.type, {});
let tree = hub.render();
find(tree, node => node.type === 'TemplatesTab').props.onUse('weekly-update');
assert.equal(lastUrl, '/messages?tab=broadcasts&brand=example');
query = new URL(lastUrl, 'https://fixture.invalid').searchParams.toString();
tree = hub.render();
assert.equal(find(tree, node => node.type === 'BroadcastsTab').props.templateToLoad, 'weekly-update');
assert.equal(find(tree, node => node.type === 'BroadcastsTab').props.visible, true);
hub.close();

const { CreatorInvitesSection } = load('src/components/settings/creator-invites-section.tsx');
const inviteFixture = (overrides = {}) => ({ id: 'one', brand: 'example', code: 'aabbccdd', current_uses: 0, max_uses: 100, expires_at: '2026-11-17T12:00:00Z', active: true, created_at: '2026-11-10T12:00:00Z', ...overrides });
fetchImpl = async () => response({ invite: inviteFixture() });
const invites = harness(CreatorInvitesSection, { tenantId: 'fixture', brands: [{ slug: 'example', name: 'Example', display_name: null }] });
await button(invites.render(), 'Generate link').props.onClick();
clipboardImpl = async () => { throw new Error('Denied'); };
await button(invites.render(), 'Copy link').props.onClick();
tree = invites.render();
assert.match(text(tree), /Could not copy the link/);
assert.match(text(tree), /https:\/\/fixture.invalid\/join\/aabbccdd/);
assert.doesNotMatch(text(tree), /Copied/);
let resolveCopy;
clipboardImpl = () => new Promise(resolve => { resolveCopy = resolve; });
const copying = button(tree, 'Copy link').props.onClick();
assert.doesNotMatch(text(invites.render()), /Copied/);
resolveCopy(); await copying;
assert.match(text(invites.render()), /Copied/);
invites.close();

// Brand selection hands off through the actual URL, preserving unrelated
// query values. Roster navigation uses the immediate local selection while the
// URL/server props still contain the previous brand; server rerenders retain
// generated links (keyed by tenant).
const inviteBrands = [
  { slug: 'example', name: 'Example', display_name: 'Example Brand' },
  { slug: 'second', name: 'Second', display_name: 'Second Brand' },
];
query = 'keep=fixture&page=9';
const scopedInviteProps = { tenantId: 'fixture', brands: inviteBrands };
const scopedInvites = harness(CreatorInvitesSection, scopedInviteProps);
tree = scopedInvites.render();
assert.equal(button(tree, 'Generate link').props.disabled, true, 'Multiple brands require an explicit selection');
const invitationRosterLink = tree => find(tree, node => node.type === 'NavigationLink' && text(node).trim() === 'Open creator roster');
assert.equal(invitationRosterLink(tree).props.href, '/roster');
assert.equal(nodes(tree).filter(node => node.type === 'NavigationLink' && text(node).trim() === 'Open creator roster').length, 1);
const invitationChoice = () => find(scopedInvites.render(), node => node.type === 'ChoiceMenu');
const choiceBeforeSelection = invitationChoice();
choiceBeforeSelection.props.onChange('not-in-workspace');
assert.equal(invitationChoice().props.value, '', 'Unlisted brand values are ignored');
choiceBeforeSelection.props.onChange('second');
assert.equal(lastUrl, '/roster/invitations?keep=fixture&brand=second');
assert.equal(invitationChoice().props.value, 'second');
assert.equal(query, 'keep=fixture&page=9', 'The simulated router has not supplied a new URL yet');
assert.equal(scopedInviteProps.initialBrand, undefined, 'The server has not supplied a new brand yet');
assert.equal(invitationRosterLink(scopedInvites.render()).props.href, '/roster?brand=second', 'An immediate roster click follows the local selection without awaiting RSC');
query = new URL(lastUrl, 'https://fixture.invalid').searchParams.toString();
scopedInviteProps.initialBrand = 'second';
scopedInvites.render(); // Effect applies server-selected brand after navigation.
assert.equal(invitationChoice().props.value, 'second');

const brandRead = {
  select() { return this; },
  eq() { return this; },
  async order() { return { data: inviteBrands, error: null }; },
};
dependencies['@/lib/auth/require-screen'] = { requireScreen: async () => ({ tenantId: 'fixture', role: 'admin', brandScope: { kind: 'all' }, impersonating: false }) };
dependencies['@/lib/auth/permissions'] = { can: () => true };
dependencies['@/lib/supabase/server'] = { createAdminClient: async () => ({ from: table => { assert.equal(table, 'brands_v2'); return brandRead; } }) };
const onboardingPage = await load('src/app/(admin)/roster/invitations/page.tsx').default({ searchParams: Promise.resolve(Object.fromEntries(new URLSearchParams(query))) });
assert.equal(find(onboardingPage, node => node.type === 'PageHeader').props.actions, undefined, 'The server header cannot expose a second, stale roster destination');
const serverInviteSection = find(onboardingPage, node => node.type === 'CreatorInvitesSection');
assert.equal(serverInviteSection.props.initialBrand, 'second');
assert.equal(serverInviteSection.key, 'fixture', 'Brand changes preserve the current session links');

// A synchronous lock prevents duplicate mutations and scope changes even before
// React paints the disabled controls. The request payload retains the brand.
let createCount = 0, resolveCreate, generatedPayload;
fetchImpl = async (url, options) => {
  assert.equal(url, '/api/invites/generate');
  createCount++;
  generatedPayload = JSON.parse(options.body);
  return new Promise(resolve => { resolveCreate = resolve; });
};
tree = scopedInvites.render();
const generateBeforePaint = button(tree, 'Generate link');
const choiceBeforePaint = find(tree, node => node.type === 'ChoiceMenu');
const generating = generateBeforePaint.props.onClick();
await generateBeforePaint.props.onClick();
choiceBeforePaint.props.onChange('example');
tree = scopedInvites.render();
assert.equal(createCount, 1);
assert.deepEqual(generatedPayload, { brand: 'second', tenant_id: 'fixture' });
assert.equal(invitationChoice().props.value, 'second');
assert.equal(invitationRosterLink(tree).props.href, '/roster?brand=second', 'A rejected pending scope change cannot change the roster destination');
assert.equal(invitationChoice().props.disabled, true);
assert.equal(button(tree, 'Generating…').props.disabled, true);
assert.equal(lastUrl, '/roster/invitations?keep=fixture&brand=second');
resolveCreate(response({ error: 'Fixture service unavailable' }, false));
await generating;
tree = scopedInvites.render();
assert.match(text(find(tree, node => node.props.role === 'alert')), /Fixture service unavailable/);
assert.equal(invitationChoice().props.disabled, false);
assert.equal(button(tree, 'Generate link').props.disabled, false);

// Retrying clears the previous error while awaiting the response. A confirmed
// result announces the display name and remains visible after another brand
// choice/server handoff, so its only copy opportunity is not lost.
const generateRetry = button(tree, 'Generate link').props.onClick();
assert.equal(nodes(scopedInvites.render()).filter(node => node.props.role === 'alert').length, 0);
resolveCreate(response({ invite: inviteFixture({ id: 'second-one', brand: 'second', code: '1122334455667788' }) }));
await generateRetry;
tree = scopedInvites.render();
assert.match(text(find(tree, node => node.props.role === 'status')), /Invitation created for Second Brand/);
assert.ok(button(tree, 'Copy invitation link for Second Brand'));
invitationChoice().props.onChange('example');
assert.equal(scopedInviteProps.initialBrand, 'second');
assert.equal(new URLSearchParams(query).get('brand'), 'second');
assert.equal(invitationRosterLink(scopedInvites.render()).props.href, '/roster?brand=example', 'A second immediate switch cannot follow the previous server brand');
query = new URL(lastUrl, 'https://fixture.invalid').searchParams.toString();
scopedInviteProps.initialBrand = 'example';
scopedInvites.render();
tree = scopedInvites.render();
assert.equal(invitationChoice().props.value, 'example');
assert.ok(button(tree, 'Copy invitation link for Second Brand'));
scopedInvites.close();

// Missing, mismatched and unusable responses must not expose a copyable link
// or announce success. Each case uses a fresh session to avoid prior results.
for (const malformed of [
  {},
  { invite: inviteFixture({ brand: 'different' }) },
  { invite: inviteFixture({ code: '' }) },
  { invite: inviteFixture({ expires_at: 'not-a-date' }) },
  { invite: inviteFixture({ max_uses: null }) },
]) {
  fetchImpl = async () => response(malformed);
  const invalidInvite = harness(CreatorInvitesSection, { tenantId: 'fixture', brands: [inviteBrands[0]] });
  await button(invalidInvite.render(), 'Generate link').props.onClick();
  tree = invalidInvite.render();
  assert.ok(find(tree, node => node.props.role === 'alert'), 'Malformed invitation is an actionable error');
  assert.doesNotMatch(text(tree), /Invitation created for/);
  assert.equal(nodes(tree).filter(node => node.type === 'Button' && text(node).trim() === 'Copy link').length, 0);
  invalidInvite.close();
}

// HTTP failures cannot be converted into successful results, and the no-brand
// disabled state is backed by the handler rather than styling alone.
fetchImpl = async () => response({ invite: inviteFixture() }, false);
const failedInvite = harness(CreatorInvitesSection, { tenantId: 'fixture', brands: [inviteBrands[0]] });
await button(failedInvite.render(), 'Generate link').props.onClick();
assert.doesNotMatch(text(failedInvite.render()), /Invitation created for/);
assert.ok(find(failedInvite.render(), node => node.props.role === 'alert'));
failedInvite.close();
let emptyInviteFetches = 0;
fetchImpl = async () => { emptyInviteFetches++; return response({}); };
const emptyInvites = harness(CreatorInvitesSection, { tenantId: 'fixture', brands: [] });
tree = emptyInvites.render();
assert.match(text(tree), /No active brands are available/);
assert.equal(find(tree, node => node.type === 'ChoiceMenu').props.disabled, true);
assert.equal(button(tree, 'Generate link').props.disabled, true);
await button(tree, 'Generate link').props.onClick();
assert.equal(emptyInviteFetches, 0);
emptyInvites.close();

const { InboxTab } = load('src/components/messages/inbox-tab.tsx');
const inbox = harness(InboxTab, { conversations: [], loading: true, loadFailed: false, onMarkReadLocal() {} });
tree = inbox.render();
// Use the same list selector after loading to simulate two unlinked Discord identities.
const inboxReady = harness(InboxTab, { conversations: [{ creator_id: 0 }], loading: false, loadFailed: false, onMarkReadLocal() {} });
tree = inboxReady.render();
let list = find(tree, node => node.type === 'ConversationList');
list.props.onSelect({ creator_id: 0, creator_name: 'First', discord_user_id: 'discord-one' });
assert.equal(find(inboxReady.render(), node => node.type === 'ChatThread').key, 'discord-one');
list.props.onSelect({ creator_id: 0, creator_name: 'Second', discord_user_id: 'discord-two' });
assert.equal(find(inboxReady.render(), node => node.type === 'ChatThread').key, 'discord-two');
list.props.onSelect({ creator_id: '00000000-0000-4000-8000-000000000001', creator_name: 'No statistics', discord_user_id: 'discord-one', total_gmv_7d: null, total_videos_7d: null });
tree = inboxReady.render();
const unavailableThread = find(tree, node => node.type === 'ChatThread');
assert.equal(unavailableThread.props.gmv, undefined);
assert.equal(unavailableThread.props.postCount, undefined);
assert.ok(nodes(tree).some(node => node.type === 'CreatorContextPanel'), 'UUID creators retain their context panel');
inbox.close(); inboxReady.close();

const { ConversationList, convKey: actualConvKey } = load('src/components/messages/conversation-list.tsx');
const sharedDiscord = { discord_user_id: 'shared-discord' };
assert.notEqual(actualConvKey({ ...sharedDiscord, creator_id: 'one', conversation_key: 'creator:one' }), actualConvKey({ ...sharedDiscord, creator_id: 'two', conversation_key: 'creator:two' }), 'Scoped API conversation keys keep separate creator threads apart even when Discord identity is shared');
assert.equal(actualConvKey({ ...sharedDiscord, creator_id: 'one' }), 'shared-discord', 'Full-tenant legacy grouping retains its Discord key');
assert.equal(actualConvKey({ creator_id: 'one', discord_user_id: null }), 'creator:one');
const missingStats = harness(ConversationList, { conversations: [{ creator_id: 'example', creator_name: 'No statistics', discord_user_id: null, total_gmv_7d: null, total_videos_7d: null, performance_available: false, status: 'unavailable' }], activeKey: null, onSelect() {} });
assert.match(text(missingStats.render()), /Performance unavailable/);
assert.doesNotMatch(text(missingStats.render()), /0 posts|\$0 GMV/);
missingStats.close();

const { ChatThread } = load('src/components/messages/chat-thread.tsx');
fetchImpl = async () => response({ error: 'Forbidden' }, false);
const chat = harness(ChatThread, { creatorId: 1, creatorName: 'Example' });
chat.render(); await flush(); tree = chat.render();
assert.match(text(tree), /Could not load messages/);
assert.doesNotMatch(text(tree), /No messages yet/);
const retryThread = button(tree, 'Retry loading messages').props.onClick;
fetchImpl = async () => response({ messages: [], hasMore: false });
await retryThread();
await flush();
tree = chat.render();
assert.match(text(tree), /No messages yet/);
find(tree, node => node.type === 'textarea').props.onChange({ target: { value: 'Keep this draft' } });
fetchImpl = async () => response({ error: 'Unavailable' }, false);
await button(chat.render(), 'Send message').props.onClick();
tree = chat.render();
assert.match(text(tree), /Delivery could not be confirmed/);
assert.equal(find(tree, node => node.type === 'textarea').props.value, 'Keep this draft');
assert.ok(nodes(tree).some(node => node.props?.['aria-label'] === 'Delivery status: unknown'));
assert.ok(!nodes(tree).some(node => node.props?.['aria-label'] === 'Delivery status: pending'));
const message = (id, sent_at) => ({ id, sent_at, direction: 'inbound', channel: 'dm', content: id, status: 'delivered' });
fetchImpl = async () => response({ messages: [message('recent', '2026-11-10T12:00:00Z')], hasMore: true });
await retryThread();
await flush();
fetchImpl = async () => response({ messages: [message('older', '2026-11-09T12:00:00Z')], hasMore: false });
await button(chat.render(), 'Load more').props.onClick();
fetchImpl = async () => response({ messages: [message('recent', '2026-11-10T12:00:00Z'), message('newest', '2026-11-10T13:00:00Z')], hasMore: true });
await Promise.all([...intervals].map(tick => tick()));
tree = chat.render();
assert.match(text(tree), /older/); assert.match(text(tree), /newest/);
assert.equal(nodes(tree).filter(node => node.key === 'recent').length, 1);
fetchImpl = async () => response({ message: { ...message('failed-send', '2026-11-10T14:00:00Z'), direction: 'outbound', status: 'failed' } });
await button(chat.render(), 'Send message').props.onClick();
tree = chat.render();
assert.match(text(tree), /was not delivered/);
assert.equal(find(tree, node => node.type === 'textarea').props.value, 'Keep this draft');
const savedMessage = { ...message('saved-send', '2026-11-10T15:00:00Z'), direction: 'outbound' };
let resolveSend;
fetchImpl = async url => url.endsWith('/send') ? new Promise(resolve => { resolveSend = resolve; }) : response({ messages: [savedMessage], hasMore: true });
const pendingSend = button(chat.render(), 'Send message').props.onClick();
await flush();
await Promise.all([...intervals].map(tick => tick()));
resolveSend(response({ message: savedMessage, warning: 'Delivered to Discord, but conversation history could not be saved. Do not resend.' }));
await pendingSend;
tree = chat.render();
assert.equal(nodes(tree).filter(node => node.key === 'saved-send').length, 1, 'Polling and send completion cannot duplicate one message');
assert.equal(find(tree, node => node.type === 'textarea').props.value, '');
assert.doesNotMatch(text(tree), /could not be confirmed|was not delivered/);
assert.match(text(tree), /Delivered to Discord, but conversation history could not be saved. Do not resend./);
chat.close();

fetchImpl = async () => response({ error: 'Unavailable' }, false);
const recoveredChat = harness(ChatThread, { creatorId: 1, creatorName: 'Example' });
recoveredChat.render(); await flush();
assert.match(text(recoveredChat.render()), /Could not load messages/);
fetchImpl = async () => response({ messages: [message('latest-page', '2026-11-10T15:00:00Z')], hasMore: true });
await Promise.all([...intervals].map(tick => tick()));
tree = recoveredChat.render();
assert.doesNotMatch(text(tree), /Could not load messages/);
assert.ok(button(tree, 'Load more'), 'Poll recovery restores older-page navigation after the first request failed');
fetchImpl = async () => response({ messages: [message('oldest-page', '2026-11-09T15:00:00Z')], hasMore: false });
await button(tree, 'Load more').props.onClick();
recoveredChat.render();
fetchImpl = async () => response({ messages: [message('latest-page', '2026-11-10T15:00:00Z')], hasMore: true });
await Promise.all([...intervals].map(tick => tick()));
assert.doesNotMatch(text(recoveredChat.render()), /Load more/, 'Polling page1 cannot reopen an exhausted older-page cursor');
recoveredChat.close();

const { CoachingRecords } = load('src/app/(admin)/reporting/coaching/records.tsx');
fetchImpl = async () => response({ assignments: [{ id: 'assignment', coach_id: 'coach', reviewer_id: 'reviewer', brand_id: 'brand' }], reports: [], people: [], brands: [], submissions: [], reviews: [], canConfigure: false });
const coaching = harness(CoachingRecords, {});
coaching.render(); await flush(); tree = coaching.render();
find(tree, node => node.type?.name === 'ReportForm').props.setDirty(true);
tree = coaching.render();
const elite = find(tree, node => node.type === 'PageHeader').props.actions;
assert.equal(elite.props.onNavigate, undefined, 'The inner Elite link must not ask a second time');
confirmCalls = 0;
assert.equal(anchorClick('/reporting/coaching/elite').defaultPrevented, true, 'Outer Creator performance tab preserves draft when discard is cancelled');
assert.equal(anchorClick('/dashboard').defaultPrevented, true, 'Sidebar navigation uses the same dirty guard');
assert.equal(confirmCalls, 2);
for (const options of [{ target: '_blank' }, { download: true }, { event: { ctrlKey: true } }, { event: { metaKey: true } }, { event: { button: 1 } }]) {
  assert.equal(anchorClick('/dashboard', options).defaultPrevented, false);
}
assert.equal(anchorClick('#report').defaultPrevented, false, 'A same-page hash does not discard the draft');
assert.equal(anchorClick('#').defaultPrevented, false, 'An empty same-page hash also stays in the report');
assert.equal(confirmCalls, 2, 'New tabs, downloads and modified/hash clicks do not prompt');
confirmResult = true;
assert.equal(anchorClick(elite.props.href).defaultPrevented, false, 'Confirmed discard allows Elite navigation');
assert.equal(confirmCalls, 3, 'An inner-link click confirms exactly once');
const unload = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
for (const handler of windowListeners.get('beforeunload') ?? []) handler(unload);
assert.equal(unload.defaultPrevented, false, 'A confirmed full-page navigation does not prompt a second time');
// During an in-flight save, a clean report also blocks shell navigation without a discard prompt.
const reportForm = find(coaching.render(), node => node.type?.name === 'ReportForm');
reportForm.props.setDirty(false);
let resolveSave;
fetchImpl = async () => new Promise(resolve => { resolveSave = resolve; });
const savePending = reportForm.props.save({ action: 'save' });
coaching.render();
assert.equal(anchorClick('/dashboard').defaultPrevented, true, 'Busy saves block outer navigation even with no dirty draft');
assert.equal(confirmCalls, 3, 'Busy navigation is blocked without offering to discard an in-flight save');
resolveSave(response({ error: 'Fixture save failed' }, false));
await savePending;
coaching.render();
assert.equal(anchorClick('/dashboard').defaultPrevented, false, 'A settled clean report allows navigation');
coaching.close();
dependencies['@/lib/coaching/elite'] = { shiftDay: value => value };
const { EliteView } = load('src/app/(admin)/reporting/coaching/elite/view.tsx');
for (const canManageGroups of [false, true]) {
  const eliteView = harness(EliteView, { canManageGroups });
  const actions = find(eliteView.render(), node => node.type === 'PageHeader').props.actions;
  assert.equal(Boolean(actions), canManageGroups, 'Only users with roster access get the Discord groups action');
  eliteView.close();
}
console.log('PASS Operations UI: legacy template handoff, onboarding brand URL handoff, generate locking/retry/response integrity, no-brand state, honest clipboard feedback, Discord thread identity, thread failure/retry and draft preservation, loaded history polling, Coaching discard guard');
