import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const creatorId = '11111111-1111-4111-8111-111111111111';
const start = '2026-09-05', end = '2026-09-11';
let rosterRead, canViewCreatorCost, canWrite, impersonating, contractMode, editProps, removalProps, capturedContracts, summaryCalls, changeIds, agreementProps, relationshipBrand, identityReads;
const profile = {
  id: creatorId, real_name: 'Fixture Creator', status: 'Active', email: null, phone: null, notes: null,
  accounts: [{ tiktok_username: 'fixture', is_primary: true }], brands: ['alpha', 'beta'], brandsWithData: ['alpha', 'beta'],
};
const nil = () => null;
const money = value => { assert.equal(typeof value, 'number', 'Unavailable costs must never be formatted as zero'); assert.ok(Number.isFinite(value)); return '$' + value; };
function contract(id, brand, amount, owner) {
  return {
    managedId: id, brand, notes: `${brand} scoped notes`, status: 'Active', reportingStartDate: null,
    retainerStartDate: brand === 'beta' ? '2026-02-01' : '2026-01-01', creatorTags: [`${brand} cohort`],
    studio: {
      asOf: end, month: '2026-09',
      agreement: { source: 'ledger', status: 'active', partnershipType: null, retainer: (canViewCreatorCost || contractMode === 'raw-cost') && contractMode !== 'nullable' ? amount : null, requiredPosts: brand === 'beta' ? 4 : 10, periodStart: '2026-09-01', periodEnd: '2026-09-30', comparable: true },
      delivery: { month: '2026-09', start: '2026-09-01', through: end, published: 3, qualifying: null, pace: null, basis: 'recorded_publications', reason: 'qualification_unverified' },
      owner: { id: `${brand}-manager`, name: owner, avatar: null, role: 'Brand manager' }, ownerStatus: 'assigned',
    },
  };
}
const data = {
  getCreatorProfile: async () => { identityReads.profile++; return profile; }, getCreatorIdByHandle: async () => { identityReads.handle++; return creatorId; },
  getCreatorContracts: async () => { throw Error('The Studio profile must not load current-date contracts or trigger renewals'); },
  getPostsPublishedThisMonth: async () => { throw Error('Selected-period publishing must not use the host calendar month'); },
  getCreatorBrandRelationship: async (_creator, brandId) => { relationshipBrand = brandId; return { role: 'creator', status: 'Active' }; },
  getCreatorSummary: async (_creator, requestedStart, requestedEnd, brand) => {
    summaryCalls.push({ requestedStart, requestedEnd, brand });
    return { total_gmv: 123, total_orders: 8, total_items_sold: 9, total_videos: 2, prev_gmv: 94, prev_orders: 6, prev_items_sold: 7, prev_videos: 1 };
  },
  getCreatorVideos: async () => [], getCreatorTopContent: async () => [], getCreatorAccountBreakdown: async () => [],
  getCreatorBrandBreakdown: async () => [{ brand: 'alpha', gmv: 80, orders: 5, items_sold: 6, videos: 1 }, { brand: 'beta', gmv: 43, orders: 3, items_sold: 3, videos: 1 }],
  getCreatorLifetimeStats: async () => ({ total_gmv: 999, total_orders: 50, first_active_date: '2026-01-01' }),
  getCreatorChangeHistory: async (ids, cost) => { changeIds = [...ids]; assert.equal(cost, canViewCreatorCost); return []; },
};
const modules = {
  '@/lib/data/creator-profile-studio': {
    getCreatorStudioContracts: async (id, asOf, brand) => {
      capturedContracts.push({ id, asOf, brand });
      if (contractMode === 'unavailable') return { status: 'unavailable', contracts: [] };
      const rows = [contract(1, 'alpha', 7419, 'Alpha manager'), contract(2, 'beta', 4019, 'Beta manager')];
      if (contractMode === 'duplicate') rows.push(contract(3, 'beta', 6321, 'Other recorded manager'));
      return { status: 'ready', contracts: rows.filter(row => !brand || row.brand === brand) };
    },
    getCreatorPublicationEvidence: async () => { throw Error('Async delivery evidence should remain inside its own streamed slot in this test'); },
  },
  '@/components/creators/studio-profile-workspace': {
    // Render every tab and aside, including those hidden by the actual client,
    // so fee privacy cannot depend on which section is selected.
    CreatorProfileWorkspace: ({ identity, headline, aside, sections, deliveryReview, coachingReview }) => {
      const deliveryContract = deliveryReview.props.children.props.contract;
      if (!canViewCreatorCost && deliveryContract) assert.equal(deliveryContract.studio.agreement.retainer, null, 'Streamed delivery props contain no withheld cost');
      return React.createElement(React.Fragment, null, identity, headline, aside,
        ...sections.map(section => React.createElement('section', { key: section.id, 'data-section': section.id }, section.content)), coachingReview);
    },
    ProfileWorkspaceLink: ({ children }) => React.createElement('button', null, children),
    ProfileReviewButton: ({ children }) => React.createElement('button', null, children),
  },
  '@/components/creators/studio-profile-controls': {
    ProfileCreatorTags: ({ brand, managedId, tags }) => { assert.equal(brand, 'beta'); assert.equal(managedId, 2); return React.createElement('span', null, tags.join(', ')); },
    StudioVideoCover: nil, ProfileRefreshButton: nil,
  },
  '@/components/creators/studio-profile-reviews': {
    CreatorDeliveryReview: nil, CreatorCoachingReview: props => {
      if (!canViewCreatorCost && props.studio) assert.equal(props.studio.agreement.retainer, null, 'Client review props contain no withheld fee');
      return null;
    },
  },
  '@/components/creators/reporting-start-date': { ReportingStartDate: props => { assert.ok(changeIds.includes(props.managedId)); return null; } },
  '@/components/creators/agreement-workspace': { AgreementWorkspace: props => { agreementProps = props; assert.equal(props.readOnlyLoad, true, 'Preview agreement GET cannot trigger renewal writes'); assert.equal(props.initialMonth, '2026-09'); return null; } },
  '@/lib/auth/permissions': { can: (_scope, _screen, action) => action === 'write' ? canWrite : rosterRead },
  '@/components/creators/coaching-brief': { CoachingBrief: nil },
  '@/components/creators/profile-video-grid': { ProfileVideoGrid: nil },
  '@/components/creators/performance/profile-headline-metrics': { ProfileHeadlineMetrics: ({ summary }) => React.createElement('span', null, money(summary.total_gmv) + ' · ' + summary.total_orders + ' orders · ' + summary.total_items_sold + ' units') },
  '@/components/creators/brand-identity': { BrandIdentity: ({ label }) => React.createElement('span', null, label) },
  react: React, 'react/jsx-runtime': jsx, 'next/link': ({ children, ...props }) => React.createElement('a', props, children),
  'next/navigation': { notFound: () => { throw Error('404'); }, redirect: () => { throw Error('redirect'); } },
  'lucide-react': { ArrowLeft: nil, ExternalLink: nil },
  '@/components/creators/creator-portrait': { CreatorPortrait: nil },
  '@/components/creators/creator-edit-panel': { CreatorEditButton: props => { editProps = props.creator; return null; } },
  '@/components/roster/creator-removal-button': { CreatorRemovalButton: props => { removalProps = props; return React.createElement('button', null, 'Remove creator'); } },
  '@/components/creators/creator-change-history': { CreatorChangeHistory: nil },
  '@/components/creators/relationship-history': { RelationshipHistory: nil },
  '@/components/creators/performance/profile-history': { ProfilePerformanceHistory: nil },
  '@/components/creators/brand-filter': { BrandFilter: nil },
  '@/components/dashboard/date-range-picker': { DateRangePicker: nil },
  '@/components/video/video-title-button': { VideoTitleButton: nil },
  '@/components/layout/breadcrumb-context': { SetBreadcrumb: nil },
  '@/lib/auth/workspace-scope': { getWorkspaceScope: async () => ({ canViewCreatorCost, role: 'manager', impersonating: impersonating ? { userId: 'member' } : undefined }) },
  '@/lib/data/data-anchor': { getDataAnchorDate: async () => end },
  '@/lib/data/date-utils': { resolveDateRange: () => ({ startDate: start, endDate: end, lagDays: 0, anchorDate: end }) },
  '@/lib/data/brand-registry': { getBrandRegistry: async () => ({}), activeBrandSlugs: () => ['alpha', 'beta'], brandLabel: (_, brand) => brand, slugToUuid: (_, brand) => brand + '-id' },
  '@/lib/utils/format': { formatCurrency: money, formatNumber: value => String(value) },
  '@/lib/data/creator-profile': data,
  '@/components/creators/studio-profile.module.css': new Proxy({}, { get: (_, key) => String(key) }),
};
const exports = {};
const source = readFileSync('src/app/(admin)/creators/[name]/page.tsx', 'utf8');
assert.ok(!/\bgetCreatorContracts\b|\bgetPostsPublishedThisMonth\b/.test(source), 'Studio source contains no current-date agreement or host-month publication loader');
runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, { exports, process: { env: { CREATOR_AGREEMENTS_ENABLED: 'true', CREATOR_AGREEMENTS_WRITES_ENABLED: 'true' } }, URLSearchParams,
  require: name => { assert.ok(name in modules, name); return modules[name]; } });
function reset() {
  rosterRead = true; canViewCreatorCost = true; canWrite = true; impersonating = false; contractMode = 'normal'; editProps = undefined; removalProps = undefined;
  capturedContracts = []; summaryCalls = []; changeIds = []; agreementProps = undefined; relationshipBrand = undefined;
  identityReads = { profile: 0, handle: 0 };
}
const render = async (brand = 'beta', name = creatorId) => renderToStaticMarkup(await exports.default({ params: Promise.resolve({ name }), searchParams: Promise.resolve({ brand }) }));

reset(); let html = await render();
assert.ok(html.includes('$4019') && !html.includes('$7419') && !html.includes('$999'), 'Selected brand excludes cross-brand fees and lifetime totals even in inactive sections');
assert.deepEqual(capturedContracts, [{ id: creatorId, asOf: end, brand: 'beta' }], 'Agreement and publishing context follows the resolved reporting end, with the selected brand passed to its scoped reader');
assert.deepEqual(summaryCalls, [{ requestedStart: start, requestedEnd: end, brand: 'beta' }]);
assert.deepEqual(changeIds, [2]); assert.equal(editProps.brandId, 'beta-id'); assert.equal(editProps.brandNotes, 'beta scoped notes'); assert.equal(relationshipBrand, 'beta-id');
assert.ok(html.includes('Beta manager') && !html.includes('Alpha manager'));
assert.ok(html.includes('3 recorded publications in September') && html.includes('have not been verified') && html.includes('never projected backward'));
assert.ok(html.includes('$123') && html.includes('8 orders') && html.includes('9 units'));
assert.equal(agreementProps.canWrite, true); assert.equal(agreementProps.canSave, true);
assert.equal(removalProps.managedId, 2, 'Removal uses the selected brand roster row, never the canonical creator identity');
assert.equal(removalProps.brand, 'beta'); assert.equal(removalProps.brandLabel, 'beta'); assert.equal(removalProps.name, 'Fixture Creator');
assert.ok(html.includes('Remove creator'), 'Authorized profile view exposes the removal control');

reset(); canViewCreatorCost = false; html = await render();
assert.ok(!html.includes('$4019') && !html.includes('$7419') && !html.includes('Fee unavailable'), 'Cost-blind output omits fees across all rendered tabs and aside');
assert.ok(html.includes('$123'), 'Performance remains visible independently of cost access');
assert.equal(agreementProps, undefined, 'Cost-blind views do not mount the agreement editor');
reset(); canViewCreatorCost = false; contractMode = 'raw-cost'; html = await render();
assert.ok(!html.includes('$4019') && !html.includes('$7419'), 'The page independently scrubs upstream cost fields before passing hidden review props');

reset(); contractMode = 'nullable'; html = await render();
assert.ok(html.includes('Fee unavailable') && !html.includes('$0') && !html.includes('$null'), 'Missing compensation stays unavailable instead of becoming zero');

reset(); contractMode = 'duplicate'; html = await render();
assert.deepEqual(changeIds, [2, 3]); assert.equal(editProps.brandId, null, 'Duplicate brand records cannot arbitrarily select a brand-scoped edit target');
assert.equal(editProps.brandNotes, null); assert.ok(html.includes('Multiple roster records exist') && html.includes('Tags by roster record'));
assert.ok(!html.includes('Beta manager') && !html.includes('Other recorded manager') && !html.includes('3 recorded publications in September'), 'An ambiguous relationship cannot borrow one record’s owner or delivery');
assert.equal(removalProps, undefined, 'Duplicate records cannot silently select a destructive target');

reset(); impersonating = true; html = await render(); assert.equal(editProps, undefined, 'Read-only view-as cannot open editing'); assert.equal(agreementProps.canWrite, false); assert.equal(removalProps, undefined, 'View-as cannot mount removal');
reset(); canWrite = false; html = await render(); assert.equal(removalProps, undefined, 'Read-only members cannot mount removal'); assert.ok(!html.includes('Remove creator'));
reset(); html = await render('all'); assert.equal(removalProps, undefined, 'All-brands profile cannot expose ambiguous multi-brand removal');
reset(); contractMode = 'unavailable'; html = await render(); assert.ok(html.includes('Agreement context could not be loaded') && !html.includes('$0'), 'Source failures remain visibly unavailable'); assert.equal(removalProps, undefined, 'Missing relationship data cannot establish a removal target');
reset(); html = await render('outside'); assert.ok(html.includes('Brand view unavailable')); assert.equal(capturedContracts.length, 0); assert.equal(summaryCalls.length, 0, 'Invalid brand cannot broaden a performance query');
for (const name of [creatorId, 'fixture']) {
  reset(); rosterRead = false; html = await render('beta', name);
  assert.ok(html.includes('Creator profile unavailable'));
  assert.deepEqual(identityReads, { profile: 0, handle: 0 }, 'Roster denial precedes both handle resolution and creator profile loading');
  assert.equal(summaryCalls.length, 0); assert.equal(capturedContracts.length, 0); assert.equal(editProps, undefined);
}
console.log('PASS profile workspace: selected-date/brand data and edit scope, cost privacy across inactive panels, nullable costs, safe duplicate records, read-only agreement loading, view-as, and unavailable sources');
