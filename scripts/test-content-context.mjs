import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const creatorA = '11111111-1111-4111-8111-111111111111';
const creatorB = '22222222-2222-4222-8222-222222222222';
let scope, fixtures, failed, calls, mutations;
function load(file, dependencies) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, AbortSignal, console, URL, Map, Set, Promise,
    require: name => { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; },
  });
  return exports;
}
const can = (actor, screen, level) => actor.permissions?.has(`${screen}:${level}`) ?? false;
function query(table) {
  const filters = []; let from = 0, to = Infinity, single = false, change = null;
  const q = {
    select(columns) { calls.push(['select', table, columns]); return q; },
    eq(key, value) { calls.push(['eq', table, key, value]); filters.push(row => row[key] === value); return q; },
    neq(key, value) { calls.push(['neq', table, key, value]); filters.push(row => row[key] !== value); return q; },
    in(key, values) { calls.push(['in', table, key, [...values]]); filters.push(row => values.includes(row[key])); return q; },
    is(key, value) { filters.push(row => row[key] === value); return q; },
    order() { return q; }, range(a, b) { from = a; to = b + 1; return q; }, limit(cap) { to = cap; return q; }, returns() { return q; },
    abortSignal() { return q; }, maybeSingle() { single = true; return q; }, single() { single = true; return q; },
    insert(value) { change = { action: 'insert', value }; return q; },
    update(value) { change = { action: 'update', value }; return q; }, delete() { change = { action: 'delete' }; return q; },
    then(resolve, reject) {
      if (failed === table) return Promise.resolve({ data: null, error: { message: 'Source failed' } }).then(resolve, reject);
      let data = (fixtures[table] ?? []).filter(row => filters.every(filter => filter(row))).slice(from, to).map(row => ({ ...row }));
      if (change) { mutations.push({ table, ...change, selected: data }); if (change.action === 'insert') data = [{ id: 'new-review', ...change.value }]; }
      return Promise.resolve({ data: single ? data[0] ?? null : data, error: null }).then(resolve, reject);
    },
  };
  return q;
}
const client = { from: query, rpc(name, args) {
  calls.push(['rpc', name, args]);
  if (name === 'get_video_lifetime_stats') return Promise.resolve({ data: [{ gmv: 110, orders: 3, items_sold: 4, daily: [{ d: '2026-10-01', gmv: 110, views: null }] }], error: null });
  const data = name === 'get_managed_posts' ? [
    { video_id: 'video-1', video_title: 'First video', creator_handle: 'alice', brand_slug: 'alpha', gmv: '100', orders: 2, items_sold: 3, views: null, likes: null, comments: null, shares: null, is_managed: true },
    { video_id: 'video-2', video_title: 'Second video', creator_handle: 'bob', brand_slug: 'alpha', gmv: 10, orders: 1, items_sold: 1, views: 10, likes: 2, comments: 1, shares: null, is_managed: false },
  ] : [{ post_count: 2, total_gmv: 110, total_views: 10, total_likes: 2, total_comments: 1, views_known: 1 }];
  assert.ok(['get_managed_posts', 'get_managed_posts_totals'].includes(name));
  return Promise.resolve({ data, error: null });
} };
function reset() {
  scope = { userId: 'actor', tenantId: 'tenant-a', permissions: new Set(['posts:read', 'posts:write', 'roster:read']), brandScope: { kind: 'scoped', brandSlugs: ['alpha'], brandIds: ['brand-a'] } };
  fixtures = {
    brands_v2: [{ id: 'brand-a', slug: 'alpha', tenant_id: 'tenant-a', is_archived: false }, { id: 'brand-b', slug: 'beta', tenant_id: 'tenant-a', is_archived: false }, { id: 'foreign-brand', slug: 'alpha', tenant_id: 'other', is_archived: false }],
    managed_creators: [{ id: 1, tenant_id: 'tenant-a', brand: 'alpha', creator_id: creatorA, tags: [' ELITE ', 'elite'], archived_at: null, account_1: ' ALICE ' }, { id: 2, tenant_id: 'tenant-a', brand: 'beta', creator_id: creatorA, tags: ['other-brand'], archived_at: null, account_1: 'alice' }, { id: 3, tenant_id: 'other', brand: 'alpha', creator_id: creatorA, tags: ['foreign'], archived_at: null, account_1: 'alice' }, { id: 4, tenant_id: 'tenant-a', brand: 'alpha', creator_id: creatorA, tags: ['archived'], archived_at: '2026-01-01', account_1: 'alice' }, { id: 5, tenant_id: 'tenant-a', brand: 'alpha', creator_id: null, tags: ['new cohort'], archived_at: null, account_1: '@bob' }],
    tiktok_accounts: [{ id: 1, tenant_id: 'tenant-a', brand_id: 'brand-a', creator_id: creatorA, tiktok_username: '@Alice' }, { id: 2, tenant_id: 'tenant-a', brand_id: 'brand-a', creator_id: creatorA, tiktok_username: 'alice.2' }],
    creator_brands: [{ id: 1, tenant_id: 'tenant-a', brand_id: 'brand-a', creator_id: creatorA }],
    creators_v2: [{ id: creatorA, tenant_id: 'tenant-a', real_name: 'Actual Creator' }, { id: creatorB, tenant_id: 'other' }],
    user_profiles: [{ user_id: 'actor', tenant_id: 'tenant-a' }, { user_id: 'coach', tenant_id: 'tenant-a' }, { user_id: 'foreign', tenant_id: 'other' }],
    videos: [{ video_id: 'video-1', brand: 'alpha', tenant_id: 'tenant-a' }, { video_id: 'private-video', brand: 'alpha', tenant_id: 'other' }],
    video_reviews: [{ id: 'r1', video_id: 'video-1', brand: 'alpha', reviewer_user_id: 'actor', notes: 'Own workspace note', rating: 4, tags: [], updated_at: '2026-10-01' }, { id: 'r2', video_id: 'video-1', brand: 'beta', reviewer_user_id: 'coach', notes: 'Same workspace cross-brand note', rating: null, tags: ['needs-rework'], updated_at: '2026-10-02' }, { id: 'r3', video_id: 'video-1', brand: 'alpha', reviewer_user_id: 'foreign', notes: 'Foreign private note', rating: 1, tags: ['off-brand'], updated_at: '2026-10-03' }],
  };
  failed = null; calls = []; mutations = [];
}
const tags = load('src/lib/roster/creator-tags.ts', {});
const context = load('src/lib/data/posts-creator-context.ts', {
  'server-only': {}, '@/lib/auth/permissions': { can }, '@/lib/supabase/server': { createAdminClient: async () => client }, '@/lib/roster/creator-tags': tags,
});
const posts = [{ brand_slug: 'alpha', creator_handle: 'alice', gmv: 123 }, { brand_slug: 'alpha', creator_handle: 'alice.2', gmv: 5 }, { brand_slug: 'alpha', creator_handle: 'bob', gmv: 0 }, { brand_slug: 'alpha', creator_handle: 'unlinked', gmv: 2 }];
reset(); let rows = await context.enrichPostCreators(scope, posts);
assert.equal(rows[0].creator_id, creatorA); assert.equal(rows[0].creator_tags.join(','), 'elite');
assert.equal(rows[0].creator_name, 'Actual Creator');
assert.equal(rows[1].creator_id, creatorA); assert.equal(rows[1].creator_tags.join(','), 'elite', 'A canonical extra account inherits the same brand-local tags');
assert.equal(rows[2].creator_id, null); assert.equal(rows[2].creator_tags.join(','), 'new cohort');
assert.equal(rows[3].creator_context_status, 'ready'); assert.equal(rows[3].creator_tags.length, 0); assert.equal(rows[0].gmv, 123);
assert.ok(calls.filter(call => call[0] === 'select').every(call => calls.some(filter => filter[0] === 'eq' && filter[1] === call[1] && filter[2] === 'tenant_id' && filter[3] === 'tenant-a')));
reset(); fixtures.creators_v2[1].tenant_id = 'tenant-a'; fixtures.creator_brands.push({ id: 2, tenant_id: 'tenant-a', brand_id: 'brand-a', creator_id: creatorB }); fixtures.tiktok_accounts.push({ id: 3, tenant_id: 'tenant-a', brand_id: 'brand-a', creator_id: creatorB, tiktok_username: 'alice' });
rows = await context.enrichPostCreators(scope, posts); assert.equal(rows[0].creator_context_status, 'unavailable'); assert.equal(rows[0].creator_id, null); assert.equal(rows[0].creator_tags.length, 0, 'Conflicting identities never assign another person\'s tags');
reset(); fixtures.creators_v2[0].tenant_id = 'other'; rows = await context.enrichPostCreators(scope, posts); assert.equal(rows[0].creator_id, null); assert.equal(rows[0].creator_context_status, 'unavailable');
reset(); failed = 'managed_creators'; rows = await context.enrichPostCreators(scope, posts); assert.ok(rows.every(row => row.creator_context_status === 'unavailable')); assert.equal(rows[0].gmv, 123);
reset(); scope.permissions.delete('roster:read'); rows = await context.enrichPostCreators(scope, posts); assert.ok(rows.every(row => row.creator_context_status === 'unavailable')); assert.equal(calls.length, 0);
reset(); rows = await context.enrichPostCreators(scope, [{ ...posts[0], brand_slug: 'beta' }]); assert.equal(rows[0].creator_context_status, 'unavailable'); assert.equal(calls.length, 0);
reset(); fixtures.managed_creators = Array.from({ length: 1001 }, (_, index) => ({ id: index + 1, tenant_id: 'tenant-a', brand: 'alpha', archived_at: null, creator_id: null, account_1: `handle${index}`, tags: ['cohort'] })); rows = await context.enrichPostCreators(scope, [{ ...posts[0], creator_handle: 'handle1000' }]); assert.equal(rows[0].creator_tags.join(','), 'cohort', 'Metadata reads include rows beyond PostgREST default cap');

const reviews = load('src/lib/data/post-reviews.ts', { 'server-only': {}, '@/lib/auth/permissions': { can } });
reset(); let result = await reviews.postVideoAssociation(client, scope, 'video-1', 'alpha'); assert.equal(result, null);
reset(); result = await reviews.postVideoAssociation(client, scope, 'private-video', 'alpha'); assert.equal(result.status, 404); assert.ok(!calls.some(call => call[1] === 'video_reviews'));
reset(); result = await reviews.postVideoAssociation(client, scope, 'video-1', 'beta'); assert.equal(result.status, 403); assert.equal(calls.length, 0);
reset(); let history = await reviews.readTenantVideoReviews(client, scope, { videoId: 'video-1', includeNotes: true }); assert.equal(history.length, 2); assert.equal(history[0].notes, 'Same workspace cross-brand note'); assert.ok(!history.some(row => row.notes === 'Foreign private note'));
reset(); await reviews.readTenantVideoReviews(client, scope); assert.ok(calls.some(call => call[1] === 'video_reviews' && call[0] === 'select' && !call[2].includes('notes')), 'List aggregates do not fetch private note text');
reset(); failed = 'user_profiles'; await assert.rejects(reviews.readTenantVideoReviews(client, scope), /could not be verified/); assert.ok(!calls.some(call => call[1] === 'video_reviews'));
reset(); scope.permissions.delete('posts:read'); await assert.rejects(reviews.readTenantVideoReviews(client, scope), /Not permitted/); assert.equal(calls.length, 0);
reset(); fixtures.video_reviews = Array.from({ length: 1002 }, (_, index) => ({ id: `r${index}`, video_id: 'video-1', reviewer_user_id: 'actor', updated_at: '2026-01-01' })); assert.equal((await reviews.readTenantVideoReviews(client, scope, { videoId: 'video-1' })).length, 1002);

const postsReader = load('src/lib/data/posts.ts', {
  '@/lib/supabase/server': { createAdminClient: async () => client }, '@/lib/auth/permissions': { can }, './post-reviews': reviews,
});
const readPosts = (extra = {}) => postsReader.getPosts({ scope, brand: null, startDate: '2026-10-01', endDate: '2026-10-31', managedOnly: false, currentUserId: 'actor', ...extra });
reset(); await assert.rejects(readPosts(), /Video data is unavailable for this workspace/); assert.ok(!calls.some(call => call[0] === 'rpc'), 'A reused slug is denied before any legacy aggregation');
reset(); fixtures.brands_v2 = fixtures.brands_v2.filter(row => row.tenant_id === 'tenant-a'); let postResult = await readPosts(); assert.equal(postResult.posts[0].review_count, 2); assert.equal(postResult.posts[0].avg_rating, 4); assert.equal(postResult.posts[0].flagged, true); assert.equal(postResult.posts[0].has_my_review, true); assert.equal(postResult.posts[0].views, null); assert.equal(postResult.posts[0].gmv, 100); assert.equal(postResult.totals.reviewedCount, 1); assert.equal(postResult.totals.unreviewedCount, 1);
assert.ok(calls.filter(call => call[0] === 'rpc').every(call => call[2].p_brand_slugs.join(',') === 'alpha' && call[2].p_date_basis === 'earned'));
reset(); fixtures.brands_v2 = fixtures.brands_v2.filter(row => row.tenant_id === 'tenant-a'); postResult = await readPosts({ dateBasis: 'posted', reviewFilter: 'unreviewed' }); assert.equal(postResult.posts.length, 1); assert.equal(postResult.posts[0].video_id, 'video-2'); assert.equal(postResult.totals.postCount, 2, 'Review filtering does not rewrite the full-window basis'); assert.ok(calls.filter(call => call[0] === 'rpc').every(call => call[2].p_date_basis === 'posted'));
reset(); scope.permissions.delete('posts:read'); await assert.rejects(readPosts(), /Not permitted/); assert.equal(calls.length, 0);
reset(); failed = 'brands_v2'; await assert.rejects(readPosts(), /Brand access could not be verified/);
reset(); fixtures.brands_v2 = fixtures.brands_v2.filter(row => row.tenant_id === 'tenant-a'); failed = 'user_profiles'; await assert.rejects(readPosts(), /Team review access could not be verified/, 'A review failure is not inbox zero');
reset(); postResult = await readPosts({ allowedBrandSlugs: ['beta'] }); assert.equal(postResult.posts.length, 0); assert.ok(!calls.some(call => call[0] === 'rpc'), 'Caller-provided scope cannot widen a manager to another brand');

let associationResult, notesFailure, associationCalls;
const route = load('src/app/api/posts/[videoId]/reviews/route.ts', {
  'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
  '@/lib/auth/workspace-scope': { getWorkspaceScope: async () => scope }, '@/lib/auth/permissions': { can },
  '@/lib/supabase/server': { createAdminClient: async () => client }, '@/lib/data/review-tags': { REVIEW_TAGS: [{ slug: 'needs-rework' }] },
  '@/lib/data/post-reviews': {
    postVideoAssociation: async () => { associationCalls++; return associationResult; },
    readTenantVideoReviews: async () => { if (notesFailure) throw Error('No history'); return [{ notes: 'Verified note' }]; },
  },
});
const request = body => ({ nextUrl: new URL('https://example.invalid/api/posts/video-1/reviews?brand=alpha'), json: async () => body ?? ({ brand: 'alpha', rating: 4, notes: 'Draft', tags: [] }) });
const params = { params: Promise.resolve({ videoId: 'video-1' }) };
function routeReset() { reset(); associationResult = null; notesFailure = false; associationCalls = 0; }
routeReset(); result = await route.GET(request(), params); assert.equal(result.status, 200); assert.equal(associationCalls, 1); assert.equal(result.body.reviews[0].notes, 'Verified note');
routeReset(); associationResult = { status: 404, error: 'Not in this brand' }; assert.equal((await route.GET(request(), params)).status, 404);
routeReset(); notesFailure = true; assert.equal((await route.GET(request(), params)).status, 500);
for (const verb of ['POST', 'DELETE']) {
  routeReset(); scope.permissions.delete('posts:write'); assert.equal((await route[verb](request(), params)).status, 403); assert.equal(mutations.length, 0); assert.equal(associationCalls, 0);
  routeReset(); scope.impersonating = { userId: 'someone' }; assert.equal((await route[verb](request(), params)).status, 403); assert.equal(mutations.length, 0);
  routeReset(); associationResult = { status: 404, error: 'Not in this brand' }; assert.equal((await route[verb](request(), params)).status, 404); assert.equal(mutations.length, 0);
}
routeReset(); fixtures.video_reviews = []; result = await route.POST(request(), params); assert.equal(result.status, 200); assert.equal(mutations[0].value.reviewer_user_id, 'actor'); assert.equal(mutations[0].value.brand, 'alpha');
routeReset(); result = await route.DELETE(request(), params); assert.equal(result.status, 200); assert.equal(mutations[0].selected.length, 1); assert.equal(mutations[0].selected[0].reviewer_user_id, 'actor');

const reviewPage = load('src/app/(admin)/posts/[videoId]/page.tsx', {
  react: { cache: fn => fn }, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
  'next/navigation': { redirect: path => { throw Error(`Redirect:${path}`); }, notFound: () => { throw Error('Not found'); } },
  '@/lib/auth/workspace-scope': { getWorkspaceScope: async () => scope, isBrandInScope: (actor, input) => actor.brandScope.kind === 'all' || actor.brandScope.brandSlugs.includes(input.slug) },
  '@/lib/auth/permissions': { can }, '@/lib/supabase/server': { createAdminClient: async () => client },
  '@/lib/data/brand-registry': { getBrandRegistry: async () => ({}) }, '@/lib/data/brand-registry-core': { brandLabel: (_registry, slug) => slug },
  '@/lib/utils/format': { resolveWatchUrl: (_stored, handle, id) => `https://www.tiktok.com/@${handle}/video/${id}` },
  '@/lib/data/post-reviews': reviews, './post-review-client': { PostReviewClient: 'review-client' },
});
const pageInput = { params: Promise.resolve({ videoId: 'video-1' }), searchParams: Promise.resolve({ brand: 'alpha', start: '2026-10-01', end: '2026-10-31' }) };
reset(); scope.permissions.delete('posts:read'); assert.equal((await reviewPage.generateMetadata(pageInput)).title, 'Post — Tempo'); await assert.rejects(reviewPage.default(pageInput), /Redirect/); assert.equal(calls.length, 0, 'Read-denied metadata and pages do not query private video rows');
reset(); fixtures.brands_v2 = fixtures.brands_v2.filter(row => row.tenant_id === 'tenant-a'); result = await reviewPage.default(pageInput); assert.equal(result.props.initialReviews.length, 2); assert.equal(result.props.canWrite, true); assert.ok(!result.props.initialReviews.some(row => row.reviewer_user_id === 'foreign'));
reset(); fixtures.brands_v2 = fixtures.brands_v2.filter(row => row.tenant_id === 'tenant-a'); scope.permissions.delete('posts:write'); assert.equal((await reviewPage.default(pageInput)).props.canWrite, false);
reset(); fixtures.brands_v2 = fixtures.brands_v2.filter(row => row.tenant_id === 'tenant-a'); scope.impersonating = { userId: 'actor' }; assert.equal((await reviewPage.default(pageInput)).props.canWrite, false);

const plain = tag => function PlainTestComponent({ children, ...props }) { return React.createElement(tag, props, children); };
const icon = () => React.createElement('svg', { 'aria-hidden': true });
const reviewClient = load('src/app/(admin)/posts/[videoId]/post-review-client.tsx', {
  react: React, 'react/jsx-runtime': jsxRuntime, 'next/link': { default: plain('a') },
  'lucide-react': { ArrowLeft: icon, ExternalLink: icon, Loader2: icon, Save: icon, Star: icon, Trash2: icon },
  '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') }, '@/hooks/use-brand-meta': { useBrandMeta: () => ({ color: () => '#6E4BCC', label: value => value }) },
  '@/components/posts/tiktok-player': { TikTokPlayer: () => React.createElement('div', null, 'Video player') },
  '@/lib/utils/format': { formatCurrency: value => `$${value}`, formatNumber: String },
  '@/lib/data/review-tags': { REVIEW_TAGS: [{ slug: 'needs-rework', label: 'Needs rework' }], reviewTagLabel: value => value },
  '@/components/ui/badge': { Badge: plain('span') }, '@/components/ui/button': { Button: plain('button'), buttonVariants: () => '' },
  '@/components/ui/card': { Card: plain('section'), CardContent: plain('div'), CardHeader: plain('header') },
  '@/components/ui/input': { Textarea: plain('textarea') }, '@/components/ui/label': { Label: plain('label') },
  '@/components/ui/info-tooltip': { InfoTooltip: () => null }, '@/components/ui/modal-overlay': { ModalOverlay: plain('div') },
  '@/components/charts/sparkline': { Sparkline: () => null }, '@/components/ui/workspace-layout.module.css': { default: { page: 'page' } },
});
reset(); const props = { meta: { video_id: 'video-1', brand_slug: 'alpha', brand_name: 'Alpha', creator_handle: 'alice', title: 'A video', stats: null, daily: [], window: null, video_url: null, post_date: null }, initialReviews: fixtures.video_reviews.slice(0, 2), currentUserId: 'actor' };
let html = renderToStaticMarkup(React.createElement(reviewClient.PostReviewClient, { ...props, canWrite: false }));
assert.match(html, /read-only view/); assert.match(html, /Own workspace note/); assert.doesNotMatch(html, /Save review|Update review|Your video review notes|>Delete</, 'Read-only viewers see saved notes without mutation controls');
html = renderToStaticMarkup(React.createElement(reviewClient.PostReviewClient, { ...props, canWrite: true })); assert.match(html, /Update review/); assert.match(html, /Your video review notes/);

console.log('PASS Content metadata: current brand tags, canonical extra accounts, tenant/brand isolation, ambiguous identities, complete pagination, and optional source failures');
console.log('PASS Content reviews: actual tenant/brand video association, same-team cross-brand history, foreign reviewer exclusion, read/write capabilities, impersonation, and fail-closed review reads');
