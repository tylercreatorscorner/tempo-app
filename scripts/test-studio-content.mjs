import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const nodeRequire = createRequire(import.meta.url);
const compile = path => ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const format = {};
runInNewContext(compile('src/lib/utils/format.ts'), { exports: format, require: nodeRequire });
const model = {};
runInNewContext(compile('src/lib/posts/studio-content.ts'), { exports: model, require: name => {
  if (name === '@/lib/utils/format') return format;
  throw new Error(`Unexpected dependency: ${name}`);
} });
const {
  normalizeContentQuery, filterContentPosts, summarizeContent, contentCsv,
  contentPostKey, postAgeDays, ageBucket, CONTENT_AGE_OPTIONS,
} = model;
const clean = value => JSON.parse(JSON.stringify(value));
const end = '2026-10-31';
const dateAgo = days => new Date(Date.parse(`${end}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
const post = (extra = {}) => ({
  video_id: '1001', video_title: 'Routine demonstration', video_url: null,
  creator_handle: 'Jake', brand_slug: 'alpha', brand_name: 'Alpha', post_date: end,
  views: null, likes: null, comments: null, shares: null, engagement_rate: null,
  gmv: 10, orders: 2, items_sold: 3, is_managed: true,
  review_count: 0, avg_rating: null, flagged: false, has_my_review: false,
  creator_id: null, creator_tags: ['Elite', 'Retainer'], creator_context_status: 'ready', ...extra,
});
const rows = [
  post(),
  post({ video_id: '1002', video_title: 'Older routine', creator_handle: 'jake2', post_date: dateAgo(90), views: 0, likes: 0, gmv: 8, orders: 1, items_sold: 2, creator_tags: ['Affiliate'] }),
  post({ video_id: '1003', video_title: 'Evergreen content', post_date: dateAgo(180), views: 100, likes: 5, gmv: 6, orders: 3, items_sold: 4, review_count: 1, avg_rating: 4, flagged: true, has_my_review: true }),
  post({ video_id: '1004', video_title: 'Date not recorded', creator_handle: 'Unlinked', post_date: null, gmv: 4, orders: 0, items_sold: 0, creator_context_status: 'unavailable' }),
  post({ video_id: '1003', brand_slug: 'beta', brand_name: 'Beta', post_date: dateAgo(180), gmv: 3, orders: 1, items_sold: 2, review_count: 1, avg_rating: 4, has_my_review: true, creator_tags: [] }),
];
const query = extra => ({ ...normalizeContentQuery({}), ...extra });

// Saved URLs normalize safely without rewriting data scope or mixing exact
// creator matching with the free-text search field.
assert.deepEqual(clean(normalizeContentQuery(new URLSearchParams('creator=%40JaKe&age=90-180&review=flagged&sort=post_age&dir=asc&tag=ELITE&metrics=engagement'))), {
  q: '', creator: 'jake', age: '90-180', review: 'flagged', sort: 'post_age', dir: 'asc', tag: 'elite', metrics: 'engagement',
});
assert.equal(normalizeContentQuery({ age: 'nonsense', sort: 'prototype', review: 'everyone', dir: 'sideways' }).age, 'all');
assert.equal(normalizeContentQuery({ age: 'nonsense', sort: 'prototype', review: 'everyone', dir: 'sideways' }).sort, 'gmv');
assert.equal(normalizeContentQuery({ q: ['first', 'second'] }).q, 'first');
assert.equal(filterContentPosts(rows, query({ creator: '@JAKE' }), end).length, 3);
assert.equal(filterContentPosts(rows, query({ q: 'OLDER' }), end)[0].video_id, '1002');
assert.equal(filterContentPosts(rows, query({ review: 'flagged' }), end)[0].video_id, '1003');
assert.equal(filterContentPosts(rows, query({ review: 'reviewed-by-me' }), end).length, 2);
assert.equal(filterContentPosts(rows, query({ review: 'unreviewed' }), end).length, 3);
assert.equal(filterContentPosts(rows, query({ tag: 'elite' }), end).length, 2, 'Unavailable metadata must not assert a tag match');
const namedRows = [post({ creator_name: 'Alisha Belle' }), post({ video_id: '1006', creator_handle: 'Brenna', creator_name: null }), post({ video_id: '1007', creator_name: undefined })];
assert.equal(filterContentPosts(namedRows, query({ q: 'BELLE' }), end)[0].video_id, '1001', 'Search includes the saved human name');
assert.equal(filterContentPosts(namedRows, query({ q: 'Unknown' }), end).length, 0, 'Unavailable names do not become fabricated searchable labels');
assert.equal(filterContentPosts(namedRows, query({ creator: 'Alisha Belle' }), end).length, 0, 'Exact creator filtering remains handle-based');

// The original URL intervals are disjoint and evaluated at period end, not
// at the current day. The label exposes the existing upper-exclusive bound.
for (const [days, bucket] of [[0, '0-30'], [29, '0-30'], [30, '30-60'], [59, '30-60'], [60, '60-90'], [89, '60-90'], [90, '90-180'], [179, '90-180'], [180, '180+']]) {
  assert.equal(postAgeDays(dateAgo(days), end), days);
  assert.equal(ageBucket(days), bucket);
}
assert.equal(postAgeDays(null, end), null);
assert.equal(postAgeDays('2026-02-31', end), null, 'Invalid calendar dates cannot silently roll into another month');
assert.equal(postAgeDays('2026-10-31', 'not-a-date'), null);
assert.equal(postAgeDays('2026-11-02', end), 0, 'Preserve the prior future-date clamp');
assert.equal(ageBucket(null), 'unknown');
assert.equal(CONTENT_AGE_OPTIONS.find(option => option.value === '90-180').label, '90–179 days');
assert.equal(filterContentPosts(rows, query({ age: '90-180' }), end)[0].video_id, '1002');
assert.equal(filterContentPosts(rows, query({ age: '180+' }), end).length, 2);
assert.equal(filterContentPosts(rows, query({ age: 'unknown' }), end)[0].video_id, '1004');

// Old publications still earn selected-period GMV; local age/search filters
// do not introduce a second publication-window predicate.
assert.equal(filterContentPosts(rows, query({ q: 'Evergreen' }), end)[0].gmv, 6);
assert.equal(rows[0].video_id, '1001', 'Sorting must not mutate the API/cache rows');
const ascViews = filterContentPosts(rows, query({ sort: 'views', dir: 'asc' }), end);
const descViews = filterContentPosts(rows, query({ sort: 'views', dir: 'desc' }), end);
assert.equal(ascViews[0].views, 0);
assert.equal(descViews[0].views, 100);
assert.equal(ascViews.at(-1).views, null);
assert.equal(descViews.at(-1).views, null);
for (const dir of ['asc', 'desc']) {
  const dates = filterContentPosts(rows, query({ sort: 'post_date', dir }), end);
  const ages = filterContentPosts(rows, query({ sort: 'post_age', dir }), end);
  assert.equal(dates.at(-1).post_date, null);
  assert.equal(ages.at(-1).post_date, null);
}
const tied = [post({ video_id: '1009', brand_slug: 'beta' }), post({ video_id: '1008' }), post({ video_id: '1009' })];
assert.equal(filterContentPosts(tied, query({ sort: 'gmv' }), end).map(contentPostKey).join(','), 'alpha|1008,alpha|1009,beta|1009');

const summary = summarizeContent(rows);
assert.equal(summary.videoCount, 4, 'Cross-brand rows retain one video identity');
assert.equal(summary.rowCount, 5);
assert.equal(summary.totalGmv, 31, 'Sales remain additive across their actual brand rows');
assert.equal(summary.totalOrders, 7);
assert.equal(summary.totalUnits, 11, 'Units are distinct from order count');
assert.equal(summary.totalViews, 100);
assert.equal(summary.viewsKnown, 2, 'A known zero is measured data');
assert.equal(summary.totalLikes, 5);
assert.equal(summary.totalComments, null, 'Missing engagement is not zero');
assert.equal(summary.reviewedCount, 1, 'Cross-store reviews do not duplicate video identities');
assert.equal(summary.creatorContextUnavailable, 1);
assert.equal(summarizeContent([]).totalGmv, 0);
assert.equal(summarizeContent([]).totalViews, null);

// Export only the caller's current filtered rows, preserve unknowns, protect
// spreadsheet opening, and rebuild expiring TikTok CDN links from identity.
const csvRows = [post({ video_title: '=HYPERLINK("https://bad.invalid","unsafe")\nsecond line', video_url: 'https://p16-sign.tiktokcdn.com/expired', gmv: -12.5 }), post({ video_id: '1005', creator_handle: 'Other', video_title: '\t+SUM(1,1)', views: 0, post_date: null, creator_context_status: 'unavailable' })];
const csv = contentCsv(csvRows, '2026-10-01', end);
assert.match(csv, /"Units sold"/);
assert.match(csv, /"Sales period start","Sales period end"/);
assert.match(csv, /"'=HYPERLINK\(""https:\/\/bad\.invalid"",""unsafe""\)\nsecond line"/);
assert.match(csv, /"'\t\+SUM\(1,1\)"/);
assert.match(csv, /"-12.5"/, 'Negative numeric revenue remains numeric');
assert.match(csv, /https:\/\/www\.tiktok\.com\/@Jake\/video\/1001/);
assert.ok(!csv.includes('tiktokcdn'));
assert.ok(!csv.includes('1002'), 'Export does not silently include other API rows');
assert.ok(csv.includes('"Unavailable"'));
assert.ok(csv.includes('"0"'), 'Measured zero is exported rather than blank');
assert.equal(contentCsv([], '2026-10-01', end).split('\r\n').length, 1);
const namedCsv = contentCsv(namedRows, '2026-10-01', end);
assert.match(namedCsv, /"Creator","Creator name","Brand"/);
assert.match(namedCsv, /"Alisha Belle"/);
assert.ok(!namedCsv.includes('Unknown'), 'CSV leaves unavailable names blank');

console.log('PASS Content model: saved URL filters, human-name search, exact creator/tag matches, period-end age boundaries, null-last sorting, distinct videos, scoped row totals and safe video-link CSV');
