import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tenant = id(1), foreign = id(2), creator = id(3), foreignCreator = id(4), noDetailsCreator = id(5);
const brand = id(10), otherBrand = id(11), foreignBrand = id(12), archivedBrand = id(13);
const owner = { userId: id(20), tenantId: tenant, role: 'owner', canViewFinance: true, permissions: new Set(['roster:read', 'roster:write']), brandScope: { kind: 'all' } };
let tables, calls, failure, countOverride;
function reset() {
  calls = []; failure = ''; countOverride = {};
  const link = { tenant_id: tenant, creator_id: creator, brand_id: brand, status: 'Applied', is_managed: false, applied_at: '2026-11-10T12:00:00Z' };
  tables = {
    brands_v2: [
      { id: brand, tenant_id: tenant, slug: 'owned', name: 'Own Brand', display_name: 'Own display', is_archived: false },
      { id: otherBrand, tenant_id: tenant, slug: 'other', name: 'Other Brand', display_name: null, is_archived: false },
      { id: foreignBrand, tenant_id: foreign, slug: 'foreign', name: 'PRIVATE brand', is_archived: false },
      { id: archivedBrand, tenant_id: tenant, slug: 'archived', name: 'Archived', is_archived: true },
    ],
    creators_v2: [
      { id: creator, tenant_id: tenant, real_name: 'Own Creator', email: 'own@fixture.invalid' },
      { id: foreignCreator, tenant_id: foreign, real_name: 'PRIVATE creator', email: 'PRIVATE@fixture.invalid' },
      { id: noDetailsCreator, tenant_id: tenant, real_name: null, email: null },
    ],
    creator_brands: [
      { ...link, id: id(100) },
      { ...link, id: id(101), brand_id: otherBrand, applied_at: '2026-11-09T12:00:00Z' },
      { ...link, id: id(102), creator_id: noDetailsCreator, applied_at: null },
      { ...link, id: id(103), tenant_id: foreign },
      { ...link, id: id(104), creator_id: foreignCreator },
      { ...link, id: id(105), brand_id: foreignBrand },
      { ...link, id: id(106), is_managed: true },
      { ...link, id: id(107), status: 'Active' },
      { ...link, id: id(108), brand_id: archivedBrand },
    ],
    tiktok_accounts: [
      { id: id(200), tenant_id: tenant, creator_id: creator, brand_id: brand, tiktok_username: 'own.handle' },
      { id: id(201), tenant_id: tenant, creator_id: creator, brand_id: otherBrand, tiktok_username: 'other.handle' },
      { id: id(202), tenant_id: foreign, creator_id: creator, brand_id: brand, tiktok_username: 'PRIVATE.foreign' },
      { id: id(203), tenant_id: tenant, creator_id: foreignCreator, brand_id: brand, tiktok_username: 'PRIVATE.creator' },
      { id: id(204), tenant_id: tenant, creator_id: creator, brand_id: foreignBrand, tiktok_username: 'PRIVATE.brand' },
    ],
  };
}
const field = (row, key) => key.split('.').reduce((value, part) => value?.[part], row);
const db = { from(table) {
  const filters = [], orders = [], trace = { table, filters: [] };
  let single = false, limit = 1000, columns = '', range, options;
  const query = {
    select(value, opts) { columns = value; options = opts; trace.columns = value; trace.options = opts; return query; },
    eq(key, value) { trace.filters.push(['eq', key, value]); filters.push(row => field(row, key) === value); return query; },
    in(key, values) { trace.filters.push(['in', key, values]); filters.push(row => values.includes(field(row, key))); return query; },
    order(key, options = {}) { orders.push([key, options]); return query; },
    limit(value) { limit = value; trace.limit = value; return query; },
    range(from, to) { range = [from, to]; trace.range = range; return query; },
    maybeSingle() { single = true; return query; },
    then(resolve, reject) {
      calls.push(trace);
      let rows = tables[table].map(row => ({ ...row,
        creator: tables.creators_v2.find(cv => cv.id === row.creator_id),
        brand: tables.brands_v2.find(b => b.id === row.brand_id),
      })).filter(row => (!columns.includes('creator:') || row.creator) && (!columns.includes('brand:') || row.brand) && filters.every(filter => filter(row)));
      rows.sort((a, b) => {
        for (const [key, options] of orders) {
          if (a[key] == null && b[key] != null) return options.nullsFirst === false ? 1 : -1;
          if (b[key] == null && a[key] != null) return options.nullsFirst === false ? -1 : 1;
          const compared = String(a[key]).localeCompare(String(b[key]));
          if (compared) return options.ascending === false ? -compared : compared;
        }
        return 0;
      });
      const count = Object.hasOwn(countOverride, table) ? countOverride[table] : rows.length;
      rows = range ? rows.slice(range[0], range[1] + 1) : rows.slice(0, limit);
      return Promise.resolve({ data: failure === table || options?.head ? null : single ? rows[0] ?? null : rows, count, error: failure === table ? { message: 'PRIVATE database detail' } : null }).then(resolve, reject);
    },
  };
  return query;
} };
const dependencies = {
  'react/jsx-runtime': require('react/jsx-runtime'),
  '@/components/ui/navigation-link': { NavigationLink: ({ children, ...props }) => React.createElement('a', props, children) },
  '@/components/ui/workspace-layout.module.css': { default: {} },
  '@/lib/supabase/server': { createAdminClient: async () => { calls.push({ admin: true }); return db; } },
};
function load(file) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, console, Date, Intl, Map, Set, URLSearchParams,
    require: name => { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name]; },
  });
  return exports;
}
dependencies['@/lib/auth/permissions'] = load('src/lib/auth/permissions.ts');
dependencies['@/lib/auth/creator-invite-access'] = load('src/lib/auth/creator-invite-access.ts');
const data = load('src/lib/data/onboarding-submissions.ts');
dependencies['@/lib/data/onboarding-submissions'] = data;
const { OnboardingSubmissions } = load('src/components/settings/onboarding-submissions.tsx');
const render = async (scope = owner, brandSlug, page) => renderToStaticMarkup(await OnboardingSubmissions({ scope, brandSlug, page }));

for (const denied of [null, { ...owner, tenantId: '' }, { ...owner, userId: '' }, { ...owner, role: 'manager' },
  { ...owner, role: 'viewer' }, { ...owner, permissions: undefined }, { ...owner, permissions: new Set(['roster:read']) },
  { ...owner, brandScope: { kind: 'scoped', brandIds: [brand], brandSlugs: ['owned'] } }, { ...owner, impersonating: { userId: id(99) } }]) {
  reset(); await assert.rejects(data.getOnboardingSubmissions(denied)); assert.equal(calls.length, 0);
  const html = await render(denied); assert.match(html, /require full creator access/); assert.doesNotMatch(html, /0 pending|own@|href="\/creators/); assert.equal(calls.length, 0);
}
reset(); const all = await data.getOnboardingSubmissions(owner);
assert.equal(all.total, 3); assert.equal(all.hasMore, false); assert.equal(all.submissions.length, 3);
assert.equal(all.submissions[0].id, id(100)); assert.equal(all.submissions[2].appliedAt, null);
assert.equal(all.submissions[2].name, null); assert.equal(all.submissions[2].email, null);
assert.deepEqual(JSON.parse(JSON.stringify(all.submissions.map(row => row.handles))), [['own.handle'], ['other.handle'], []]);
assert.equal(all.submissions[0].reviewUrl, `/creators/${creator}?brand=owned`);
assert.ok(!JSON.stringify(all).includes('PRIVATE'));
assert.ok(calls.filter(call => call.table).every(call => call.filters.some(([, key, value]) => key === 'tenant_id' && value === tenant)));
const linkQuery = calls.find(call => call.table === 'creator_brands');
for (const key of ['creator.tenant_id', 'brand.tenant_id']) assert.ok(linkQuery.filters.some(([, field, value]) => field === key && value === tenant));
reset(); const selected = await data.getOnboardingSubmissions(owner, 'owned'); assert.equal(selected.total, 2);
assert.ok(selected.submissions.every(row => row.brandSlug === 'owned'));
assert.ok(calls.find(call => call.table === 'creator_brands').filters.some(([, key, value]) => key === 'brand_id' && value === brand));
assert.ok(calls.find(call => call.table === 'tiktok_accounts').filters.some(([, key, values]) => key === 'brand_id' && values.length === 1 && values[0] === brand));
for (const slug of ['foreign', 'archived', 'missing']) {
  reset(); await assert.rejects(data.getOnboardingSubmissions(owner, slug), error => error.status === 404);
  assert.ok(!calls.some(call => call.table === 'creator_brands'));
}
reset(); const html = await render();
assert.match(html, /Pending creator details/); assert.match(html, /3 pending/); assert.match(html, /Claimed handles:/);
assert.match(html, /Pending review/); assert.match(html, /Name unavailable/); assert.match(html, /Email unavailable/);
assert.match(html, /Applied date unavailable/); assert.match(html, /No handles recorded/);
assert.match(html, new RegExp(`href="/creators/${creator}\\?brand=owned"`)); assert.doesNotMatch(html, /PRIVATE|<button|<form/);

for (const table of ['brands_v2', 'creator_brands', 'tiktok_accounts']) {
  reset(); failure = table; await assert.rejects(data.getOnboardingSubmissions(owner, 'owned'));
  const unavailable = await render(owner, 'owned'); assert.match(unavailable, /role="alert"/);
  assert.doesNotMatch(unavailable, /No pending|0 pending|own@fixture|PRIVATE/);
}
for (const table of ['creator_brands', 'tiktok_accounts']) {
  reset(); countOverride[table] = null; await assert.rejects(data.getOnboardingSubmissions(owner));
  reset(); countOverride[table] = 9999; await assert.rejects(data.getOnboardingSubmissions(owner));
}
reset(); tables.creator_brands = []; const empty = await render();
assert.match(empty, /0 pending/); assert.match(empty, /No pending creator details/); assert.ok(!calls.some(call => call.table === 'tiktok_accounts'));
const emptyPage = await data.getOnboardingSubmissions(owner, undefined, 999); assert.equal(emptyPage.page, 1); assert.equal(emptyPage.totalPages, 1);
assert.doesNotMatch(await render(owner, undefined, 999), /Next page|Previous page/);

reset(); const template = tables.creator_brands[0];
tables.creator_brands.push(...Array.from({ length: 30 }, (_, index) => ({ ...template, id: id(500 + index), creator_id: noDetailsCreator, applied_at: `2026-12-${String(index + 1).padStart(2, '0')}T12:00:00Z` })));
const bounded = await data.getOnboardingSubmissions(owner);
assert.equal(bounded.total, 33); assert.equal(bounded.submissions.length, 25); assert.equal(bounded.hasMore, true);
assert.equal(bounded.submissions[0].id, id(529)); assert.equal(bounded.submissions.at(-1).id, id(505));
assert.match(await render(), /Showing 1–25 of 33 pending records/);
assert.match(await render(), /href="\/roster\/invitations\?page=2"/);
const second = await data.getOnboardingSubmissions(owner, undefined, 2);
assert.equal(second.page, 2); assert.equal(second.submissions.length, 8); assert.equal(second.hasMore, false);
assert.ok(!second.submissions.some(row => bounded.submissions.some(first => first.id === row.id)));
assert.match(await render(owner, undefined, 2), /Showing 26–33 of 33 pending records/);
assert.match(await render(owner, 'owned', 2), /href="\/roster\/invitations\?page=1&amp;brand=owned"/);
assert.doesNotMatch(await render(owner, 'owned', 2), /Next page of/);
for (const page of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
  assert.equal((await data.getOnboardingSubmissions(owner, undefined, page)).page, 1);
}
assert.equal((await data.getOnboardingSubmissions(owner, undefined, Number.MAX_SAFE_INTEGER)).page, 2);
failure = 'creator_brands'; assert.match(await render(owner, undefined, 2), /Pending creator details are unavailable/);
assert.doesNotMatch(await render(owner, undefined, 2), /Showing|Next page|Previous page/);
console.log('PASS onboarding submissions: tenant and role boundaries, brand filtering, bounded honest counts, unavailable states, profile links, and read-only rendering.');
