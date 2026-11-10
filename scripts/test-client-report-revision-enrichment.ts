import assert from 'node:assert/strict';
import type { ClientReportSnapshot } from '../src/lib/data/client-reports';
import { enrichClientReportRevision, type ClientReportRecoveryEvidence } from '../src/lib/data/client-report-revision-enrichment';

const authority = { sourceReportId: 'frozen-report', tenantId: 'owned-tenant' };
const video = { title: 'Frozen title', creator: 'creator', videoUrl: 'https://www.tiktok.com/@creator/video/100', gmv: 40, orders: 4 };
const snapshot = {
  v: 1, generatedAt: '2026-11-10T15:11:39Z', views: 100, priorViews: 80, videoViews: { '100': 100 },
  publishedVideoEvidence: { sentinel: 'Preserve all evidence and coverage' },
  weekly: [{ weekEnd: '2026-11-08', gmv: 120 }], lifetime: { gmv: 500 },
  report: {
    brandSlug: 'fixture', startDate: new Date('2026-11-01T12:00:00Z'), endDate: new Date('2026-11-08T12:00:00Z'),
    totalGmv: 120, totalOrders: 12, totalItems: 15, priorTotalGmv: 100, gmvChangePct: 20,
    topVideo: video, topVideos: [video], creatorsCorner: { gmv: 30, orders: 3, topVideos: [{ ...video, gmv: 30, orders: 3 }] },
    topProducts: [{ name: 'Unknown Product', gmv: 100, orders: 10, pctOfTotal: 100 / 120 * 100 }],
    productCreatorBreakdown: [], granular: { creators: [{ sentinel: 'Frozen creator and agreement' }] },
    dailyPerformance: [{ sentinel: 'Frozen daily fact' }], reportingExclusions: { month: '2026-11', handles: [], creatorIds: [] },
  },
} as unknown as ClientReportSnapshot;
const name = (value: string, lastSeen: string) => ({ name: value, source: 'owned-source', firstSeen: '2026-01-01', lastSeen, observations: 2 });
function evidence(): ClientReportRecoveryEvidence {
  return {
    version: 1, ...authority, brandSlug: 'fixture', window: { start: '2026-11-01', end: '2026-11-08' }, observedAt: '2026-11-10T16:00:00Z',
    denominator: { metric: 'whole_shop_affiliate_gmv', value: 120 },
    productTotals: { gmv: 100, orders: 10, units: 10, sourceRows: 4, productIds: 4, earningProductIds: 4 },
    productGroups: [
      { productId: 'a', gmv: 60, orders: 6, units: 6, sourceRows: 1, unitRows: 1, nameCandidates: [name('Old name', '2026-06-01'), name('Recorded name', '2026-11-08')], topCreators: [] },
      { productId: 'b', gmv: 20, orders: 2, units: 2, sourceRows: 1, unitRows: 1, nameCandidates: [name('Conflict A', '2026-11-08'), name('Conflict B', '2026-11-08')], topCreators: [] },
      { productId: 'c', gmv: 10, orders: 1, units: 1, sourceRows: 1, unitRows: 1, nameCandidates: [name('Future name', '2026-11-09')], topCreators: [] },
      { productId: 'd', gmv: 10, orders: 1, units: 1, sourceRows: 1, unitRows: 1, nameCandidates: [name('Recorded name', '2026-11-08')], topCreators: [] },
    ],
    videoUnits: [
      { videoId: '100', scope: 'store', gmv: 40, orders: 4, units: 5, sourceRows: 2, unitRows: 2 },
      { videoId: '100', scope: 'managed', gmv: 30, orders: 3, units: 4, sourceRows: 1, unitRows: 1 },
    ],
    provenance: { facts: 'Fixture sources, no network calls' },
  };
}
const before = structuredClone(snapshot);
const result = enrichClientReportRevision(snapshot, evidence(), authority);
assert.deepEqual(snapshot, before, 'original frozen snapshot must not mutate');
assert.equal(result.report.topVideo?.units, 5); assert.equal(result.report.topVideos[0].units, 5); assert.equal(result.report.creatorsCorner.topVideos[0].units, 4);
assert.equal(result.report.topProducts.length, 4, 'same-name products remain distinct by ID');
assert.equal(result.report.topProducts[0].name, 'Recorded name'); assert.equal(result.report.topProducts[0].pctOfTotal, 50);
assert.equal(result.report.topProducts[0].nameProvenance.hasHistoricalAliases, true);
assert.equal(result.report.topProducts[1].name, 'Product b'); assert.equal(result.report.topProducts[1].nameStatus, 'conflicting');
assert.equal(result.report.topProducts[2].name, 'Product c'); assert.equal(result.report.topProducts[2].nameStatus, 'unavailable');
assert.deepEqual(result.report.productCreatorBreakdown.map(row => row.productId), ['a', 'b', 'c', 'd']);
for (const key of Object.keys(snapshot.report)) {
  if (['topVideo', 'topVideos', 'creatorsCorner', 'topProducts', 'productCreatorBreakdown'].includes(key)) continue;
  assert.deepEqual(result.report[key as keyof typeof result.report], snapshot.report[key as keyof typeof snapshot.report], `preserve report.${key}`);
}
assert.deepEqual(result.publishedVideoEvidence, snapshot.publishedVideoEvidence); assert.equal(result.generatedAt, snapshot.generatedAt);
assert.equal(result.report.creatorsCorner.gmv, snapshot.report.creatorsCorner.gmv);
const incomplete = evidence(); incomplete.videoUnits[0].unitRows = 1;
incomplete.productGroups[0].unitRows = 0; incomplete.productTotals.units = null;
const unknown = enrichClientReportRevision(snapshot, incomplete, authority);
assert.equal(unknown.report.topVideo?.units, null); assert.equal(unknown.report.topProducts[0].units, null);
for (const mutate of [
  (e: ClientReportRecoveryEvidence) => { e.tenantId = 'foreign-tenant'; },
  (e: ClientReportRecoveryEvidence) => { e.sourceReportId = 'another-report'; },
  (e: ClientReportRecoveryEvidence) => { e.brandSlug = 'other-brand'; },
  (e: ClientReportRecoveryEvidence) => { e.window.start = '2026-10-31'; },
  (e: ClientReportRecoveryEvidence) => { e.denominator.value = 100; },
  (e: ClientReportRecoveryEvidence) => { e.productGroups[1].productId = 'a'; },
  (e: ClientReportRecoveryEvidence) => { e.productTotals.gmv = 99; },
  (e: ClientReportRecoveryEvidence) => { e.videoUnits[0].gmv = 41; },
  (e: ClientReportRecoveryEvidence) => { e.videoUnits[0].orders = 5; },
  (e: ClientReportRecoveryEvidence) => { e.videoUnits.pop(); },
  (e: ClientReportRecoveryEvidence) => { e.videoUnits.push(e.videoUnits[0]); },
]) { const invalid = evidence(); mutate(invalid); assert.throws(() => enrichClientReportRevision(snapshot, invalid, authority)); }
console.log('PASS corrected-report enrichment: scope and financial reconciliation, all video-list units, stable product IDs, historical aliases/conflicts, null coverage, original evidence preservation');
