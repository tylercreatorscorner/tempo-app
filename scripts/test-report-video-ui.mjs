import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const jsx = (type, props) => ({ type, props });
const runtime = { jsx, jsxs: jsx, Fragment: 'fragment' };
let currentUrl = '', timerId = 0, state = [], cursor = 0;
const timers = new Map();
function load(path, dependencies) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, URL, URLSearchParams,
    setTimeout: callback => { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    require: name => {
      if (name === 'react/jsx-runtime') return runtime;
      assert.ok(name in dependencies, `Unexpected import ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}
const react = {
  useEffect: () => {},
  useTransition: () => [false, callback => callback()],
  useRef: initial => {
    const index = cursor++;
    if (!(index in state)) state[index] = { current: initial };
    return state[index];
  },
  useState: initial => {
    const index = cursor++;
    if (!(index in state)) state[index] = initial;
    return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
  },
};
const shared = load('src/lib/data/published-video-evidence-types.ts', {});
const ui = load('src/app/r/[token]/videos/video-library.tsx', {
  react,
  'next/link': { default: 'link' },
  'next/navigation': { useRouter: () => ({ replace: url => { currentUrl = url; } }) },
  'lucide-react': { Search: 'search-icon', X: 'close-icon', Download: 'download-icon' },
  '@/components/ui/choice-menu': { ChoiceMenu: 'choice-menu' },
  '@/components/ui/interface-icon': { InterfaceIcon: 'interface-icon' },
});
function nodes(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (typeof node !== 'object') return [node];
  if (typeof node.type === 'function') return nodes(node.type(node.props));
  return [node, ...nodes(node.props?.children)];
}
function textOf(tree) { return nodes(tree).filter(value => typeof value === 'string' || typeof value === 'number').join(' '); }
function render(component, props) { cursor = 0; return component(props); }
function fresh(component, props) { state = []; return render(component, props); }
const ids = values => Array.from(values, value => value.videoId);
const video = (index, overrides = {}) => ({
  videoId: String(7400000000000000000n + BigInt(index)), creatorHandle: 'jake', qualifyingHandles: ['jake'],
  publishedAt: `2026-10-${String(index + 1).padStart(2, '0')}`, title: `Video title ${index}`,
  watchUrl: `https://www.tiktok.com/@jake/video/${7400000000000000000n + BigInt(index)}`, ...overrides,
});
const fixture = {
  token: 'public-token', brandName: 'Example brand', periodLabel: 'October 2026', reportCount: 45, basis: 'reconstructed',
  creators: [{ key: 'id:jake', name: 'Jake Smith', handles: ['jake', 'jake_alt'] }, { key: 'handle:other', name: 'Other Creator', handles: ['other'] }],
  evidence: { v: 1, capturedAt: '2026-10-29T12:00:00Z', periodStart: '2026-10-01', periodEnd: '2026-10-31', scope: 'managed-published', total: 28, videos: Array.from({ length: 28 }, (_, i) => video(i)) },
};
let loadedLibrary = fixture;
const page = load('src/app/r/[token]/videos/page.tsx', {
  'next/navigation': { notFound: () => { throw new Error('NOT_FOUND'); } },
  '@/lib/data/client-report-videos': { getClientReportVideoLibrary: async token => { assert.equal(token, 'public-token'); return loadedLibrary; } },
  '@/lib/data/published-video-evidence-types': shared,
  './video-library': { VideoLibrary: 'video-library' },
});
const propsFor = async query => (await page.default({ params: Promise.resolve({ token: 'public-token' }), searchParams: Promise.resolve(query) })).props;
const navigate = async () => propsFor(Object.fromEntries(new URL(currentUrl, 'https://tempo.invalid').searchParams));
const alias = video(0, { creatorHandle: 'other', qualifyingHandles: ['other', 'jake_alt'] });
loadedLibrary = { ...fixture, evidence: { ...fixture.evidence, videos: [alias, video(1, { creatorHandle: 'other', qualifyingHandles: ['other'] })] } };
let props = await propsFor({ creator: 'id:jake' });
assert.deepEqual(ids(props.library.evidence.videos), [alias.videoId], 'Any qualifying account matches a saved creator, including a secondary account');
assert.equal((await propsFor({ creator: 'foreign-creator' })).filteredTotal, 0, 'Unknown creator keys fail closed');
assert.deepEqual(ids((await propsFor({ q: 'Video title 0' })).library.evidence.videos), [alias.videoId]);
loadedLibrary = fixture;
assert.deepEqual(ids((await propsFor({ sort: 'oldest' })).library.evidence.videos).slice(0, 2), [video(0).videoId, video(1).videoId]);
assert.deepEqual(ids((await propsFor({})).library.evidence.videos).slice(0, 2), [video(27).videoId, video(26).videoId]);
assert.equal(fixture.evidence.videos[0].videoId, video(0).videoId, 'Sorting never mutates the saved evidence');
assert.equal(ui.evidenceWatchUrl(video(0, { watchUrl: null })), null, 'A missing URL stays missing');
assert.equal(ui.evidenceWatchUrl(video(0, { watchUrl: `https://www.tiktok.com/@jake/video/${video(1).videoId}` })), null, 'A URL for another video is not shown');
assert.equal(ui.evidenceWatchUrl(video(0, { watchUrl: `https://evil.invalid/@jake/video/${video(0).videoId}` })), null);
assert.equal(ui.evidenceWatchUrl(video(0, { watchUrl: 'javascript:alert(1)' })), null);
assert.equal(ui.evidenceWatchUrl(video(0, { watchUrl: `${video(0).watchUrl}?tracking=private#fragment` })), video(0).watchUrl, 'Canonical watch links omit query strings and fragments');
assert.equal(ui.evidenceWatchUrl(video(0, { watchUrl: `https://m.tiktok.com/@jake/video/${video(0).videoId}/?tracking=private` })), video(0).watchUrl, 'Mobile TikTok links and trailing slashes canonicalize to the same watch link');
assert.equal(ui.evidenceWatchUrl(video(0, { watchUrl: `https://tiktok.com/@jake/video/${video(0).videoId}/` })), video(0).watchUrl);
assert.equal(ui.evidenceWatchUrl(video(0, { watchUrl: `https://tiktok.com.evil.invalid/@jake/video/${video(0).videoId}/` })), null, 'Lookalike hosts are rejected');
assert.equal(ui.evidenceWatchUrl(video(0, { watchUrl: `https://user:password@www.tiktok.com/@jake/video/${video(0).videoId}` })), null, 'Credential-bearing URLs are rejected');
assert.equal(ui.evidenceWatchUrl(video(0, { watchUrl: `https://www.tiktok.com:444/@jake/video/${video(0).videoId}` })), null, 'Nonstandard ports are rejected');
assert.equal(ui.captureLabel('2026-10-30T00:15:00Z'), 'Oct 29, 2026, 7:15 PM CDT', 'Capture timestamps use the agency timezone when UTC has crossed midnight');
assert.equal(ui.captureLabel('2026-12-01T01:30:00Z'), 'Nov 30, 2026, 7:30 PM CST', 'Capture timestamps also honor standard time');

props = await propsFor({});
assert.equal(props.library.evidence.videos.length, 25, 'Only one page is serialized to the browser');
assert.equal(props.recordedTotal, 28);
assert.equal(props.filteredTotal, 28);
let tree = fresh(ui.VideoLibrary, props);
let all = nodes(tree);
assert.equal(all.filter(node => node?.type === 'li').length, 25);
const copy = textOf(tree);
for (const phrase of ['Reconstructed video list', 'Published count in report as sent', '45', 'Videos found in current records', '28', 'The original report numbers have not changed.', 'Missing source data can leave gaps.', 'approved credits from earlier periods are separate.']) assert.ok(copy.includes(phrase), phrase);
assert.ok(all.find(node => node?.type === 'a' && node.props.target === '_blank')?.props.rel.includes('noopener'));
all.find(node => node?.type === 'button' && textOf(node) === 'Next').props.onClick();
assert.ok(currentUrl.includes('page=1'));
props = await navigate();
tree = render(ui.VideoLibrary, props);
assert.equal(nodes(tree).filter(node => node?.type === 'li').length, 3, 'The remaining videos are reachable on page two');
nodes(tree).find(node => node?.type === 'choice-menu' && node.props.label === 'Filter videos by creator').props.onChange('id:jake');
assert.equal(currentUrl, '/r/public-token/videos?creator=id%3Ajake');
props = await navigate();
tree = render(ui.VideoLibrary, props);
assert.equal(nodes(tree).filter(node => node?.type === 'li').length, 25, 'Changing filters resets pagination');
nodes(tree).find(node => node?.type === 'input').props.onChange({ target: { value: 'stale query' } });
tree = render(ui.VideoLibrary, props);
nodes(tree).find(node => node?.type === 'input').props.onChange({ target: { value: 'title 27' } });
tree = render(ui.VideoLibrary, props);
assert.ok(textOf(tree).includes('Updating video list…'), 'A scheduled search immediately shows loading feedback');
assert.equal(timers.size, 1, 'Typing cancels the earlier debounce');
for (const callback of timers.values()) callback();
timers.clear();
assert.equal(currentUrl, '/r/public-token/videos?creator=id%3Ajake&q=title+27', 'Only the latest query navigates');
props = await navigate();
tree = render(ui.VideoLibrary, props);
tree = render(ui.VideoLibrary, props);
assert.equal(nodes(tree).filter(node => node?.type === 'li').length, 1);
const csv = nodes(tree).find(node => node?.type === 'a' && textOf(node).includes('Download filtered CSV'));
assert.equal(csv.props.href, '/api/report-videos/public-token?creator=id%3Ajake&q=title+27', 'CSV uses the same complete filtered set, independent of pagination');
nodes(tree).find(node => node?.type === 'button' && node.props['aria-label'] === 'Clear video search').props.onClick();
assert.equal(currentUrl, '/r/public-token/videos?creator=id%3Ajake');
props = await navigate();
tree = render(ui.VideoLibrary, props);
tree = render(ui.VideoLibrary, props);
assert.equal(nodes(tree).find(node => node?.type === 'input').props.value, '');
tree = fresh(ui.VideoLibrary, await propsFor({ creator: 'unknown' }));
assert.ok(textOf(tree).includes('This creator is not available in the report.'));
loadedLibrary = { ...fixture, basis: 'frozen', reportCount: 28 };
tree = fresh(ui.VideoLibrary, await propsFor({}));
assert.ok(textOf(tree).includes('Captured with this report'));
assert.ok(textOf(tree).includes('Later uploads do not change this list.'));
assert.ok(!textOf(tree).includes('Reconstructed video list'));
loadedLibrary = { ...fixture, basis: 'unavailable', evidence: null, unavailableReason: 'Source temporarily unavailable.' };
tree = fresh(ui.VideoLibrary, await propsFor({}));
assert.ok(textOf(tree).includes('45'), 'A failed evidence lookup preserves the original report number');
assert.ok(textOf(tree).includes('Source temporarily unavailable.'));
assert.ok(!nodes(tree).some(node => node?.type === 'input' || node?.type === 'li'));
loadedLibrary = { ...fixture, evidence: { ...fixture.evidence, videos: [video(0, { watchUrl: null, creatorHandle: '' })] } };
tree = fresh(ui.VideoLibrary, await propsFor({}));
assert.ok(textOf(tree).includes('Video link unavailable'));
assert.ok(textOf(tree).includes('Account unavailable'));

const rows = load('src/app/r/[token]/creator-rows.tsx', {
  react,
  '@/lib/data/delivered-spend': { creatorEarnedShare: () => null },
  '@/lib/data/published-video-evidence-types': shared,
  '@/components/ui/interface-icon': { InterfaceIcon: 'interface-icon' },
});
const creators = Array.from({ length: 11 }, (_, i) => ({ creatorId: `creator-${i}`, name: `Creator ${i}`, handle: `creator_${i}`, handles: [], postsPublished: i, gmv: 1, orders: 0, isAffiliate: true, retainer: 0 }));
tree = fresh(rows.PaginatedCreatorRows, { rows: creators, judgeQuota: false, showLevel: false, videoLibraryUrl: '/r/public-token/videos' });
let links = nodes(tree).filter(node => node?.type === 'a' && textOf(node) === 'View videos');
assert.equal(links.length, 10);
assert.equal(links[0].props.href, '/r/public-token/videos?creator=id%3Acreator-0');
nodes(tree).find(node => node?.type === 'button' && textOf(node) === 'Next').props.onClick();
tree = render(rows.PaginatedCreatorRows, { rows: creators, judgeQuota: false, showLevel: false, videoLibraryUrl: '/r/public-token/videos' });
links = nodes(tree).filter(node => node?.type === 'a' && textOf(node) === 'View videos');
assert.equal(links.length, 1);
assert.equal(links[0].props.href, '/r/public-token/videos?creator=id%3Acreator-10', 'Creator identity stays stable after pagination');

assert.equal(page.metadata.robots.index, false);
assert.equal(page.metadata.robots.follow, false);
loadedLibrary = fixture;
props = await propsFor({ q: 'x'.repeat(200), page: '5', sort: 'oldest' });
assert.equal(props.initialQuery.length, 120);
assert.equal(props.initialPage, 0, 'Out-of-range pages clamp after filtering');
props = await propsFor({ page: '999999' });
assert.equal(props.initialPage, 1);
assert.equal(props.library.evidence.videos.length, 3);
loadedLibrary = null;
await assert.rejects(propsFor({}), /NOT_FOUND/);
console.log('PASS report video UI: server-only full packet, alias filters, canonical URLs, as-sent/reconstructed counts, debounced latest-query navigation, compact pagination, CSV scope, stable creator links and noindex/404');
