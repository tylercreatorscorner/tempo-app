import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(path, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { exports, Date, URL, Set, Map, Intl, console, require: name => name in dependencies ? dependencies[name] : require(name) });
  return exports;
}
const spend = load('src/lib/data/delivered-spend.ts');
const model = load('src/app/r/[token]/studio-report-model.ts', { '@/lib/data/delivered-spend': spend });
const evidence = load('src/lib/data/published-video-evidence-types.ts');
const agreement = () => ({ reportPeriodComparable: true, ledgerVersion: 1, periodStart: '2026-09-01', periodEnd: '2026-09-30', retainer: 1000, quota: 20, status: 'active' });
const creator = (name, extra = {}) => ({ name, realName: name, handle: name.toLowerCase(), isAffiliate: false, retainer: 1000, quota: 20, postsPublished: 10, gmv: 2500, orders: 50, videosEarning: 12, agreement: agreement(), ...extra });
const make = (extra = {}) => ({
  brandName: 'Alpha', brandSlug: 'alpha', startDate: new Date('2026-09-01T00:00:00Z'), endDate: new Date('2026-09-30T00:00:00Z'), periodLengthDays: 30, periodLabel: 'September 2026',
  totalGmv: 10000, totalOrders: 150, totalItems: 170, totalVideos: 40, activeCreators: 4, avgOrderValue: 30, videoCoverageComplete: true, newCreators: { count: 1, gmv: 2000 }, returningCreators: { count: 3, gmv: 8000 },
  dailyPerformance: [], topProducts: [], productCreatorBreakdown: [], topVideos: [],
  agreementSplit: { retainerGmv: 2500, affiliateGmv: 6500, unattributedGmv: -1e-10 },
  creatorsCorner: { gmv: 9000, pctOfStoreGmv: 90, gmvChangePct: 20, orders: 100, items: 120, orderChangePct: 10, videos: 35, newlyActivatedCount: 1, signedCreatorCount: 4, topVideos: [] },
  granular: { roster: { retainerHistoryExact: true }, creators: [creator('Retained'), creator('Affiliate', { isAffiliate: true, retainer: 0, quota: null, gmv: 5000, agreement: null }), creator('Departed', { departed: true, gmv: 1000, agreement: null }), creator('NoTarget', { isAffiliate: true, retainer: 0, quota: null, gmv: 500, agreement: null })] }, ...extra,
});
const report = make(), before = JSON.stringify(report);
let result = model.matchedRetainerReturn(report);
assert.equal(result.spend.earned, 500);
assert.equal(result.cohort.length, 1);
assert.equal(result.gmv, 2500, 'Sales use only the exact creators in the cost denominator');
assert.equal(result.multiple, 5, 'Affiliate and departed sales cannot inflate retainer return');
assert.equal(result.excludedGmv, 6500);
assert.equal(JSON.stringify(report), before, 'Presentation never mutates the frozen snapshot');
result = model.matchedRetainerReturn(make({ startDate: new Date('2026-09-07'), endDate: new Date('2026-09-13') }));
assert.equal(result.spend, null); assert.equal(result.multiple, null, 'Weekly GMV must not divide by monthly cost');
result = model.matchedRetainerReturn(make({ endDate: new Date('2026-09-14') }));
assert.equal(result.multiple, null, 'A partial month is not a completed-month return');
const unverified = make(); unverified.granular.roster.retainerHistoryExact = false;
assert.equal(model.matchedRetainerReturn(unverified).multiple, null, 'Carry-back estimates cannot be presented as verified comparable return');
const unknownHistory = make(); delete unknownHistory.granular.roster.retainerHistoryExact;
assert.equal(model.matchedRetainerReturn(unknownHistory).multiple, null, 'Absent historical status stays unknown');
const nonComparable = make(); nonComparable.granular.creators[0].agreement = { reportPeriodComparable: false };
assert.equal(model.matchedRetainerReturn(nonComparable).multiple, null, 'Different payment or credit rules withhold the result');
const legacyTerms = make(); legacyTerms.granular.creators[0].agreement = null;
result = model.matchedRetainerReturn(legacyTerms);
assert.equal(result.spend, null, 'A dated legacy amount is not proof of agreement periods or payment rules');
assert.equal(result.gmv, null); assert.equal(result.multiple, null);
assert.match(result.unavailableReason, /not saved for every retained creator/);
const missingTarget = make(); missingTarget.granular.creators.push(creator('Unmeasured', { quota: null, agreement: null, gmv: 500 }));
assert.equal(model.matchedRetainerReturn(missingTarget).spend, null, 'Do not silently drop a retained creator with missing commitments and call the cost cohort verified');
for (const change of [
  { reportPeriodComparable: undefined }, { reportPeriodComparable: false },
  { periodStart: undefined }, { periodStart: '2026-09-05' },
  { periodEnd: undefined }, { periodEnd: '2026-10-04' },
  { retainer: 900 }, { quota: 30 },
]) {
  const invalidTerms = make(); Object.assign(invalidTerms.granular.creators[0].agreement, change);
  assert.equal(model.matchedRetainerReturn(invalidTerms).spend, null, 'Missing, different-period or inconsistent saved terms cannot verify cost: ' + JSON.stringify(change));
}
const mixedTerms = make(); mixedTerms.granular.creators.push(creator('Legacy', { agreement: null }));
assert.equal(model.matchedRetainerReturn(mixedTerms).multiple, null, 'One verified agreement does not validate the rest of the retained cohort');
const zeroEarned = make(); zeroEarned.granular.creators[0].postsPublished = 0;
assert.equal(model.matchedRetainerReturn(zeroEarned).spend.earned, 0, 'A verified zero-publication cost stays zero, not missing');
assert.equal(model.matchedRetainerReturn(zeroEarned).multiple, null, 'Zero denominator is unavailable, not infinity');
const over = make(); over.granular.creators = [creator('Over', { postsPublished: 50 }), creator('Short', { postsPublished: 10 })];
const delivered = model.reportDelivery(over);
assert.equal(delivered.committed, 40); assert.equal(delivered.published, 60); assert.equal(delivered.credited, 30); assert.equal(delivered.remaining, 10, 'One creator overdelivering cannot erase another creator’s missing posts');
const weekly = make({ startDate: new Date('2026-09-21'), endDate: new Date('2026-09-27'), monthToDate: { start: new Date('2026-09-01'), end: new Date('2026-09-27'), granular: over.granular } });
assert.equal(model.reportDelivery(weekly).committed, 40, 'Weekly delivery uses the saved month-to-date source, without prorating monthly commitments');
assert.equal(model.reportUnits({}), null); assert.equal(model.reportUnits({ items: 0 }), 0); assert.equal(model.reportUnits({ items: NaN, unitsSold: 7 }), 7);
assert.equal(model.reportUnits({ units: 9 }), 9, 'The actual frozen SQL units alias remains visible');
const unknownCoverage = make(); delete unknownCoverage.videoCoverageComplete;
assert.equal(model.matchedRetainerReturn(unknownCoverage).multiple, null, 'Missing historical coverage status cannot become verified return');
assert.equal(model.safeTikTokUrl('https://www.tiktok.com/@alpha/video/123?tracking=private#fragment'), 'https://www.tiktok.com/@alpha/video/123');
for (const value of ['javascript:alert(1)', 'https://tiktok.com.evil.test/@alpha/video/123', 'https://u:p@www.tiktok.com/@alpha/video/123', 'https://www.tiktok.com:444/@alpha/video/123']) assert.equal(model.safeTikTokUrl(value), null);

// Render actual React to catch optional legacy fields leaking NaN, fabricated
// zero units, missing agreements, or whole-report data into the new client.
const classNames = new Proxy({}, { get: (_, key) => String(key) });
const dialog = Object.fromEntries(['Root', 'Portal', 'Content', 'Header', 'Overlay', 'Footer', 'Title', 'Description', 'Close'].map(key => [key, props => key === 'Root' && !props.open ? null : React.createElement('div', null, props.children)]));
const deps = {
  'next/link': { default: props => React.createElement('a', props, props.children) },
  'next/navigation': { useRouter: () => ({ push() {}, refresh() {} }) },
  'radix-ui': { Dialog: dialog },
  '@/components/ui/choice-menu': { ChoiceMenu: props => React.createElement('button', { 'aria-label': props.label }, props.options.find(option => option.value === props.value)?.label) },
  '@/components/ui/search-input': { SearchInput: props => React.createElement('input', { value: props.value, onChange: props.onChange, 'aria-label': props['aria-label'] }) },
  '@/components/posts/tiktok-player': { TikTokPlayer: () => null },
  '@/lib/data/delivered-spend': spend,
  '@/lib/data/published-video-evidence-types': evidence,
  './studio-report-model': model,
  './studio-report.module.css': { default: classNames },
};
const { StudioReport } = load('src/app/r/[token]/studio-report.tsx', deps);
const snapshot = { generatedAt: '2026-10-02T12:00:00Z', weekly: [{ weekEnd: '2026-09-20', gmv: 1000, rosterGmv: 500 }, { weekEnd: '2026-09-27', gmv: 1500, rosterGmv: 700 }] };
let html = renderToStaticMarkup(React.createElement(StudioReport, { token: 'saved-token', report, snapshot, brandName: 'Alpha', periodLabel: 'September 2026', notes: null, plan: 'Review creator commitments.', reportType: 'monthly', preview: true }));
assert.ok(html.includes('Your creator program, in focus.'));
assert.ok(html.includes('Managed units')); assert.ok(html.includes('Not recorded'), 'Missing per-creator units are not fabricated');
assert.ok(html.includes('$2,500')); assert.ok(html.includes('5.0x'));
assert.ok(html.includes('Agreement dates not saved'));
assert.ok(html.includes('managed creators posted or made sales this period after being inactive in the prior comparison period.'));
assert.ok(!html.includes('for the first time'), 'Activity comparison does not prove a first-ever sale');
assert.ok(html.includes('/r/saved-token/videos?preview=1'));
assert.ok(!html.includes('NaN')); assert.ok(!html.includes('Infinity'));
assert.ok(!html.includes('is not attributed to those two agreement groups'), 'Floating-point residue must not create a negative-zero discrepancy');
const legacy = make(); delete legacy.granular; delete legacy.creatorsCorner.items;
html = renderToStaticMarkup(React.createElement(StudioReport, { token: 'saved-token', report: legacy, snapshot: { generatedAt: snapshot.generatedAt, weekly: [] }, brandName: 'Alpha', periodLabel: 'September 2026', notes: null, plan: null }));
assert.ok(html.includes('Not comparable')); assert.ok(html.includes('Not recorded')); assert.ok(!html.includes('NaN'));
const publicModel = load('src/app/r/[token]/studio-report-public.ts', { './studio-report-model': model });
const wrapper = load('src/app/r/[token]/studio-report-view.tsx', {
  './reconciliation-view': { ReconciliationView: props => props }, './studio-report': { StudioReport: props => props },
  './studio-report-public': publicModel,
});
const projection = wrapper.StudioReportView({ token: 'saved-token', report, snapshot: { ...snapshot, report, publishedVideoEvidence: { privateTest: 'large evidence packet' }, videoViews: {} } }).props.snapshot;
assert.deepEqual(Object.keys(projection).sort(), ['generatedAt', 'movers', 'weekly']);
assert.equal(projection.report, undefined); assert.equal(projection.publishedVideoEvidence, undefined);
const privateReport = make();
privateReport.reportingExclusions = { handles: ['PRIVATE-EXCLUDED-HANDLE'] };
privateReport.futureInternalMetadata = 'PRIVATE-FUTURE-REPORT-FIELD';
privateReport.granular.creators[0].units = 13;
privateReport.granular.creators[0].phone = 'PRIVATE-PHONE';
privateReport.granular.creators[0].agreement = { reportPeriodComparable: true, ledgerId: 'PRIVATE-LEDGER-ID', ledgerVersion: 3, periodStart: '2026-09-01', periodEnd: '2026-09-30', revision: 3, retainer: 1000, quota: 20, status: 'active', snapshot: { actor: 'PRIVATE-ACTOR', reason: 'PRIVATE-INTERNAL-REASON', segments: [{ internal: 'PRIVATE-SEGMENT' }] } };
privateReport.monthToDate = { start: privateReport.startDate, end: privateReport.endDate, daysElapsed: 30, daysInMonth: 30, granular: privateReport.granular };
privateReport.creatorsCorner.topVideos = [{ title: 'Public video', creator: 'retained', gmv: 400, orders: 2, units: 3, videoUrl: 'https://www.tiktok.com/@retained/video/123', internal: 'PRIVATE-VIDEO-METADATA' }];
const publicProps = wrapper.StudioReportView({ token: 'saved-token', report: privateReport, snapshot: { ...snapshot, report: privateReport, weekly: [{ weekEnd: '2026-09-27', gmv: 100, rosterGmv: 50, internal: 'PRIVATE-WEEKLY' }], movers: { gained: 1, lost: 2, netChange: -1, started: 1, stopped: 0, internal: 'PRIVATE-MOVERS', list: [{ handle: 'publichandle', name: 'Public Creator', cur: 10, prior: 9, change: 1, movement: 'up', phone: 'PRIVATE-MOVER-PHONE' }] } } }).props;
assert.ok(!JSON.stringify(publicProps).includes('PRIVATE-'), 'Client serialization excludes private agreement revisions, internal exclusions, contact fields and unknown nested metadata');
assert.equal(publicProps.report.granular.creators[0].units, 13);
assert.equal(publicProps.report.monthToDate.granular.creators[0].units, 13);
assert.equal(publicProps.report.creatorsCorner.topVideos[0].units, 3);
assert.equal(publicProps.report.granular.creators[0].agreement.revision, 3, 'Public historical terms remain inspectable');
assert.equal(publicProps.report.granular.creators[0].agreement.ledgerId, undefined);
const reconciliation = wrapper.StudioReportView({ token: 'saved-token', report, snapshot: { ...snapshot, reconciliation: { rows: [] } }, brandName: 'Alpha' });
assert.ok(reconciliation.props.revision, 'Special reconciliation snapshots retain their dedicated renderer');
console.log('PASS Studio client report: matched cost cohorts, completed-month comparison, historical coverage, capped delivery, optional units, canonical links, real React legacy rendering, snapshot projection and reconciliation preservation');
