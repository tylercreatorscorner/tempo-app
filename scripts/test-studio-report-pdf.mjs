import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// This exercises the actual document and renderer, rather than asserting that
// source text happens to contain headings. The only extra runtime requirement
// is Python + pypdf (bundled by Codex, or PDF_TEST_PYTHON in other environments).
const require = createRequire(import.meta.url);
const renderer = await import('@react-pdf/renderer');
const modules = new Map();
function load(file) {
  const absolute = path.resolve(file);
  if (modules.has(absolute)) return modules.get(absolute);
  const exports = {};
  modules.set(absolute, exports);
  const code = ts.transpileModule(readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const resolveLocal = name => {
    const candidate = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(absolute), name);
    return ['', '.ts', '.tsx', '.js'].map(ext => candidate + ext).find(value => existsSync(value));
  };
  runInNewContext(code, {
    exports, process, Buffer, Date, URL, Set, Map, Intl, console, setTimeout, clearTimeout,
    __filename: absolute, __dirname: path.dirname(absolute),
    require: name => name === '@react-pdf/renderer' ? renderer
      : name.startsWith('@/') || name.startsWith('.') ? load(resolveLocal(name) ?? name) : require(name),
  });
  return exports;
}
const { BrandClientReportPDF } = load('src/lib/pdf/brand-client-report-pdf.tsx');
const { ReportReconciliationPDF } = load('src/lib/pdf/report-reconciliation-pdf.tsx');
const sampleIndex = process.argv.indexOf('--sample');
if (sampleIndex !== -1) {
  const outIndex = process.argv.indexOf('--out');
  assert.ok(outIndex !== -1 && process.argv[sampleIndex + 1] && process.argv[outIndex + 1], 'Use --sample <JSON props> --out <PDF path>');
  const props = JSON.parse(readFileSync(process.argv[sampleIndex + 1], 'utf8'));
  const data = props.data;
  data.startDate = new Date(data.startDate); data.endDate = new Date(data.endDate);
  for (const row of data.dailyPerformance ?? []) row.date = new Date(row.date);
  if (data.bestDay) data.bestDay.date = new Date(data.bestDay.date);
  if (data.monthToDate) { data.monthToDate.start = new Date(data.monthToDate.start); data.monthToDate.end = new Date(data.monthToDate.end); }
  const output = path.resolve(process.argv[outIndex + 1]);
  mkdirSync(path.dirname(output), { recursive: true });
  const bytes = await renderer.renderToBuffer(BrandClientReportPDF(props));
  writeFileSync(output, bytes);
  console.log('Rendered frozen report PDF: ' + output);
  process.exit(0);
}
const model = load('src/app/r/[token]/studio-report-model.ts');
const privateCanary = 'PRIVATE-NOT-FOR-CLIENT-PDF';
const agreement = { reportPeriodComparable: true, ledgerId: privateCanary, ledgerVersion: 1, periodStart: '2026-09-01', periodEnd: '2026-09-30', revision: 1, retainer: 1000, quota: 20, status: 'active', snapshot: { actor: privateCanary, reason: privateCanary } };
const creator = (name, extra = {}) => ({
  name, realName: name, handle: name.toLowerCase().replaceAll(' ', ''), isAffiliate: false,
  retainer: 1000, quota: 20, postsPublished: 10, videosEarning: 12, gmv: 2500, orders: 50,
  ccStartDate: '2026-08-07', agreement: { ...agreement }, ...extra,
});
const videoUrl = 'https://www.tiktok.com/@retained/video/7689752945746889998';
const make = () => {
  const creators = [
    creator('Retained', { units: 13 }),
    creator('Overdelivered', { postsPublished: 50, gmv: 1500, units: 55 }),
    creator('NoPublications', { postsPublished: 0, gmv: 1000, units: 18 }),
    creator('Affiliate', { isAffiliate: true, retainer: 0, quota: null, gmv: 5000, agreement: null }),
    creator('Departed', { departed: true, gmv: 1000, agreement: null }),
    creator('NoTarget', { isAffiliate: true, retainer: 0, quota: null, gmv: 500, agreement: null }),
    ...Array.from({ length: 36 }, (_, i) => creator('PaginationCreator' + String(i + 1).padStart(2, '0'), { isAffiliate: true, retainer: 0, quota: null, postsPublished: 0, videosEarning: 0, gmv: 0, orders: 0, agreement: null })),
  ];
  const topVideos = [{ title: 'A real video title with enough words to exercise natural line wrapping without losing any information', creator: 'retained', gmv: 500, orders: 12, units: 17, videoUrl }, { title: 'Legacy video with unknown units', creator: 'affiliate', gmv: 250, orders: 8, videoUrl: 'https://www.tiktok.com/@affiliate/video/7689752945746889999' }, { title: 'Untrusted video URL stays plain text', creator: 'affiliate', gmv: 20, orders: 1, videoUrl: 'javascript:alert(1)' }];
  creators.at(-1).realName = 'PaginationCreator36 Profile with multiple words to verify row wrapping and complete table pagination';
  return {
    brandName: 'Studio PDF Test Brand', brandSlug: 'studio-pdf-fixture', startDate: new Date('2026-09-01T00:00:00Z'), endDate: new Date('2026-09-30T00:00:00Z'), periodLabel: 'September 2026', periodLengthDays: 30,
    totalGmv: 22000, totalOrders: 440, totalItems: 485, totalVideos: 125, activeCreators: 50, avgOrderValue: 50, avgGmvPerCreator: 440, estCommission: 4400,
    priorTotalGmv: 20000, priorTotalOrders: 400, priorTotalItems: 450, priorActiveCreators: 45, priorTotalVideos: 110, gmvChangePct: 10, orderChangePct: 10, itemChangePct: 7.8, creatorChangePct: 11.1, videoChangePct: 13.6,
    videoCoverageComplete: true, priorVideoCoverageComplete: true,
    topCreator: { name: 'Retained', gmv: 2500, orders: 50, videos: 12 }, topVideo: topVideos[0], bestDay: { date: new Date('2026-09-30'), weekday: 'Wed', gmv: 11000, orders: 220, creators: 25 },
    managed: { gmv: 11500, creatorCount: 42, orders: 230 }, organic: { gmv: 10500, creatorCount: 8, orders: 210 }, managedPct: 52.3,
    creatorsCorner: { gmv: 11500, orders: 230, items: 267, creatorCount: 6, videos: 100, commission: 2300, pctOfStoreGmv: 52.3, priorGmv: 10000, priorOrders: 200, priorItems: 240, priorCreatorCount: 5, priorVideos: 90, gmvChangePct: 15, orderChangePct: 15, videoChangePct: 11.1, creatorChangePct: 20, managedAov: 50, organicAov: 50, managedGmvPerCreator: 1916.67, organicGmvPerCreator: 1312.5, signedCreatorCount: 42, activeCreatorCount: 6, newlyActivatedCount: 1, topCreators: creators.slice(0, 6).map(c => ({ name: c.name, videos: c.videosEarning, gmv: c.gmv, orders: c.orders, pctOfManaged: c.gmv / 11500 * 100 })), topVideos },
    newCreators: { count: 1, gmv: 2000 }, returningCreators: { count: 49, gmv: 20000 },
    dayOfWeek: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => ({ day, gmv: i === 3 ? 22000 : 0, isPeak: i === 3 })),
    dailyPerformance: [1, 30].map(day => ({ date: new Date(`2026-09-${String(day).padStart(2, '0')}`), weekday: day === 1 ? 'Tue' : 'Wed', gmv: 11000, orders: 220, creators: 25, isPeak: true })),
    topCreators: creators.slice(0, 6).map(c => ({ name: c.name, videos: c.videosEarning, gmv: c.gmv, orders: c.orders, pctOfTotal: c.gmv / 22000 * 100 })), topVideos,
    topProducts: [{ name: 'Product One', gmv: 9500, orders: 190, pctOfTotal: 43.2 }, { name: 'Product Two', gmv: 12500, orders: 250, pctOfTotal: 56.8 }],
    productCreatorBreakdown: [{ productName: 'Product One', productGmv: 9500, productOrders: 190, pctOfTotal: 43.2, topCreators: [{ name: 'Retained', gmv: 2500 }] }],
    activity: { rosterPosted: 5, rosterSold: 6, rosterSoldNotPosted: 1, rosterPostedNoSale: 0, storeCreatorsPosted: 25, storeCreatorsSold: 50 },
    channels: { rosterVideoGmv: 9000, rosterLiveGmv: 1500, rosterCardGmv: 1000, storeVideoGmv: 17000, storeLiveGmv: 3000, storeCardGmv: 2000 },
    agreementSplit: { retainerGmv: 5000, affiliateGmv: 6500, unattributedGmv: -1e-10 },
    granular: { roster: { signed: 42, onRetainer: 3, affiliateOnly: 39, monthlyRetainerBudget: 3000, retainerHistoryExact: true, roleCoverage: 0 }, videoCounts: { postsPublished: 100, videosEarning: 130 }, newVideo: { gmv30d: 4000, videos30d: 60, totalGmv: 9000, unknownPostDateGmv: 0 }, netNew: { netNewGmv: 8000, preCcGmv: 1000, totalGmv: 9000 }, vintage: [{ label: 'September 2026', videos: 100, gmv: 4000 }], vintageOlder: { videos: 30, gmv: 5000 }, vintageAge: { d0_30: { videos: 100, gmv: 4000 }, d30_60: { videos: 10, gmv: 2000 }, d60_90: { videos: 5, gmv: 1000 }, d90_plus: { videos: 15, gmv: 2000 }, unknown: { videos: 0, gmv: 0 } }, creators },
    reportingExclusions: { privateCanary }, futureInternalMetadata: privateCanary,
  };
};
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const folder = mkdtempSync(path.join(tmpdir(), 'tempo-studio-pdf-test-'));
const bundledPython = path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const python = process.env.PDF_TEST_PYTHON || (existsSync(bundledPython) ? bundledPython : 'python');
const inspectScript = path.join(folder, 'inspect_pdf_fixture.py');
writeFileSync(inspectScript, `import json, sys\nfrom pypdf import PdfReader\nresult = []\nfor filename in sys.argv[1:]:\n    reader = PdfReader(filename)\n    links = []\n    for page in reader.pages:\n        for ref in page.get('/Annots', []):\n            annotation = ref.get_object()\n            action = annotation.get('/A', {})\n            if action.get('/URI'): links.append(str(action['/URI']))\n    result.append({'pages': [page.extract_text() for page in reader.pages], 'links': links})\nprint(json.dumps(result))\n`);

try {
  const monthly = make();
  monthly.creatorsCorner.creatorCount = 157; // Export-present handles are not active people.
  const modelResult = model.matchedRetainerReturn(monthly);
  assert.equal(modelResult.spend.earned, 1500);
  assert.equal(modelResult.gmv, 5000);
  assert.equal(modelResult.cohort.length, 3);
  assert.equal(modelResult.multiple, 5000 / 1500, 'The PDF and web use one cost cohort, excluding affiliate/departed/no-target GMV');
  const monthlyBefore = JSON.stringify(monthly);
  const weekly = make();
  weekly.startDate = new Date('2026-09-21'); weekly.endDate = new Date('2026-09-27'); weekly.periodLabel = 'Sep 21 to Sep 27, 2026'; weekly.periodLengthDays = 7;
  weekly.granular.creators = weekly.granular.creators.slice(0, 2).map(c => ({ ...c, postsPublished: 2 }));
  weekly.monthToDate = { start: new Date('2026-09-01'), end: new Date('2026-09-27'), daysElapsed: 27, daysInMonth: 30, granular: { ...monthly.granular, creators: monthly.granular.creators.slice(0, 2) } };
  assert.equal(model.reportDelivery(weekly).credited, 30, 'MTD delivery caps overdelivery per creator');
  assert.equal(model.reportDelivery(weekly).committed, 40);
  const unknown = make(); unknown.granular.roster.retainerHistoryExact = false;
  const partial = make(); partial.videoCoverageComplete = false; partial.creatorsCorner.videos = 73;
  const legacy = make(); delete legacy.granular; delete legacy.creatorsCorner.items; delete legacy.totalItems; delete legacy.creatorsCorner.activeCreatorCount;
  legacy.creatorsCorner.topVideos = [{ ...legacy.creatorsCorner.topVideos[0], units: undefined }];
  const rateOnly = make();
  rateOnly.granular.creators = rateOnly.granular.creators.map(c => ({ ...c, agreement: null }));
  rateOnly.topProducts[0].name = 'Unknown Product';
  rateOnly.productCreatorBreakdown[0].productName = 'Unknown Product';
  const rateOnlyBefore = JSON.stringify(rateOnly);
  const variants = [
    ['monthly', monthly, { notes: 'Saved client commentary. No invented conclusion. This \u2014 remains the saved wording.', plan: 'Saved next step: review delivery commitments.', reportType: 'monthly', logo: png, videoCovers: { [videoUrl]: png } }],
    ['weekly', weekly, { notes: 'Weekly saved commentary.', plan: 'Review next week.', reportType: 'weekly' }],
    ['unverified-history', unknown, { reportType: 'monthly' }],
    ['legacy', legacy, { reportType: 'performance' }],
    ['partial-coverage', partial, { reportType: 'monthly' }],
    ['rate-history-only', rateOnly, { reportType: 'monthly', notes: 'Frozen note: 13 creators made their first sale for you this period.' }],
  ];
  for (const [name, data, props] of variants) {
    const bytes = await renderer.renderToBuffer(BrandClientReportPDF({ data, generatedAt: '2026-10-02T12:00:00Z', weekly: [{ weekEnd: '2026-09-20', gmv: 10000, rosterGmv: 5000 }, { weekEnd: '2026-09-27', gmv: 12000, rosterGmv: 6500 }], ...props }));
    assert.ok(bytes.subarray(0, 5).toString().startsWith('%PDF-'));
    writeFileSync(path.join(folder, name + '.pdf'), bytes);
  }
  const reconciliation = { version: 1, summary: 'Saved August correction. Existing invoice amounts retained.', internal: privateCanary, rows: [
    { name: 'Anna Dias', handle: 'annadias', agreement: '$300 / 30 videos per month', augustPosts: 7, creditedPosts: '7 confirmed August posts', invoice: 70, resolution: 'Seven posts at $10 each.' },
    { name: 'Julia Phillips', handle: 'juliaphillips', agreement: '$1,000 / 20 videos per month', augustPosts: 18, creditedPosts: '18 August posts plus 2 July credits', invoice: 1000, resolution: 'Two July videos count toward this invoice.' },
  ] };
  const reconciliationBefore = JSON.stringify(reconciliation);
  writeFileSync(path.join(folder, 'reconciliation.pdf'), await renderer.renderToBuffer(ReportReconciliationPDF({ revision: reconciliation, brandName: 'Studio PDF Test Brand', periodLabel: 'Aug 1 to Aug 31, 2026' })));
  const inspection = JSON.parse(execFileSync(python, [inspectScript, ...variants.map(([name]) => path.join(folder, name + '.pdf')), path.join(folder, 'reconciliation.pdf')], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
  const texts = inspection.map(report => report.pages.join('\n').replace(/\s+/g, ' '));
  // Inter kerning may appear as spaces inside words in PDF text extraction.
  // Ignore those layout spaces when checking that original content survives.
  const hasText = (text, expected) => text.replace(/\s/g, '').includes(expected.replace(/\s/g, ''));
  const [monthlyText, weeklyText, unknownText, legacyText, partialText, rateOnlyText, reconciliationText] = texts;
  for (const [index, text] of texts.entries()) {
    assert.ok(!text.includes(privateCanary), 'Internal metadata must never enter the client PDF');
    assert.ok(!/\b(?:NaN|Infinity|undefined)\b/.test(text), 'Optional fields must render without invalid values');
    assert.ok(!/[\u2013\u2014]/.test(text), 'PDF copy uses ASCII hyphens rather than Unicode dashes');
    assert.ok(inspection[index].pages.every(page => page.trim().length > 80), 'There are no blank or nearly blank pages');
    if (index < variants.length) assert.ok(inspection[index].pages.every(page => /TEMPO\s+\d+\s*\/\s*\d+/.test(page)), 'Every performance page has a visible page number');
    assert.ok(inspection[index].pages.length <= 16, 'A 42-creator fixture should remain compact');
  }
  for (const expected of ['Studio PDF Test Brand', 'Your creator program, in focus.', '$22,000', '$11,500', '$1,500', '$5,000', '3.3x', 'Saved client commentary.', 'Saved next step:', 'Product One']) assert.ok(hasText(monthlyText, expected), 'Monthly PDF omitted ' + expected);
  for (let i = 1; i <= 36; i++) assert.ok(hasText(monthlyText, 'PaginationCreator' + String(i).padStart(2, '0')), 'Pagination must preserve every creator, including the final row');
  for (const page of inspection[0].pages) if (hasText(page, 'PaginationCreator')) assert.ok(hasText(page, 'Creator performance') && hasText(page, 'Partnership / term'), 'Every creator appendix page repeats the section and column headers');
  assert.ok(monthlyText.includes('Managed units') && monthlyText.includes('267'), 'Headline units remain distinct from the 230 managed orders');
  assert.ok(monthlyText.includes('Not recorded'), 'Absent row units/dates remain explicitly unavailable');
  assert.ok(!hasText(monthlyText, '-$0 unattributed'), 'Floating-point residue must not suggest a financial discrepancy');
  assert.ok(hasText(monthlyText, '6 posted or sold in report'), 'The PDF uses saved active people rather than source handle counts');
  assert.ok(!hasText(monthlyText, '157 active in report') && !hasText(monthlyText, '157 posted or sold'), 'Export-present handles cannot become active creators');
  assert.ok(hasText(legacyText, 'Not recorded posted or sold in report'), 'Absent active-person metrics stay unavailable instead of falling back to legacy handle counts');
  assert.ok(hasText(rateOnlyText, 'Dated rates recorded as of report end. This does not establish agreement terms or full-period cost.'), 'Rate history does not claim agreement verification');
  assert.ok(!hasText(rateOnlyText, 'Dated history verified'), 'Legacy rate history must not become a broad verified-terms claim');
  assert.ok(hasText(unknownText, 'Dated rates not verified as of report end.'), 'Missing exact rate coverage remains qualified');
  assert.ok(hasText(legacyText, 'Retainer rate history: Status not saved.'), 'Missing history status is distinct from a recorded failure');
  assert.ok(hasText(rateOnlyText, 'Frozen note: 13 creators made their first sale for you this period.'), 'A presentation repair must preserve previously frozen commentary');
  assert.ok(rateOnlyText.includes('Not comparable') && !rateOnlyText.includes('3.3x'), 'Recorded rates without saved agreements cannot establish a full-period return');
  assert.ok(hasText(rateOnlyText, 'Unidentified product sales'), 'Missing product names must not imply one identified leading product');
  assert.ok(hasText(rateOnlyText, 'Source product names are unavailable; this is a combined total, not one identified product.'), 'The combined unnamed product bucket has an explicit source limitation');
  assert.ok(hasText(rateOnlyText, '$9,500 GMV') && hasText(rateOnlyText, '43.2% of total affiliate GMV'), 'The saved product figures retain their actual whole-shop denominator');
  assert.ok(!hasText(rateOnlyText, 'of product scope') && !hasText(rateOnlyText, 'Unknown Product'), 'Ambiguous product labels are removed without changing source values');
  assert.ok(hasText(rateOnlyText, 'GMV per managed export account') && hasText(rateOnlyText, 'not active-person averages'), 'Per-account efficiency does not imply active-person denominators');
  assert.ok(inspection[0].links.includes(videoUrl), 'Content cards retain real, clickable TikTok video links');
  assert.ok(inspection[0].links.every(link => /^https:\/\//.test(link)), 'Client content links use HTTPS');
  assert.ok(weeklyText.includes('Not comparable'), 'Weekly sales must not divide by monthly retainers');
  assert.ok(weeklyText.includes('Weekly saved commentary.'), 'The weekly PDF carries its frozen commentary');
  assert.ok(/30\s*\/\s*40/.test(weeklyText), 'Weekly delivery shows the capped saved month-to-date count against its full monthly commitment');
  assert.ok(!weeklyText.includes('3.3x'), 'Weekly return cannot reuse a monthly result');
  assert.ok(unknownText.includes('Not comparable') && !unknownText.includes('3.3x'), 'Unverified retainer history withholds the multiple');
  assert.ok(legacyText.includes('Not comparable') && legacyText.includes('Not recorded'), 'Legacy snapshots remain readable without fabricated metrics');
  assert.ok(hasText(partialText, 'Videos published 73') && /incomplete/i.test(partialText), 'A known partial publication count remains visible with a coverage qualifier, matching the web report');
  assert.ok(!partialText.includes('3.3x'), 'Incomplete video coverage must still withhold comparable return');
  for (const expected of ['Anna Dias', 'Julia Phillips', 'August posts: 7', 'August posts: 18', '$70.00', '$1,000.00', '18 August posts plus 2 July credits', 'Invoice amounts do not indicate payment has been sent.', 'Original report retained in Tempo.']) assert.ok(hasText(reconciliationText, expected), 'Reconciliation must preserve ' + expected);
  assert.equal(JSON.stringify(reconciliation), reconciliationBefore, 'Reconciliation styling cannot mutate corrected financial facts');
  assert.equal(JSON.stringify(monthly), monthlyBefore, 'PDF rendering cannot mutate a frozen report');
  assert.equal(JSON.stringify(rateOnly), rateOnlyBefore, 'Clarifying historical coverage cannot mutate saved agreements or rates');
  console.log('PASS Studio report PDF: actual rendered monthly/weekly/legacy/reconciliation documents, same-cohort return, unknown coverage, nullable units, saved notes, complete pagination, private-field exclusion and clickable video links');
} finally {
  if (process.env.PDF_TEST_KEEP_OUTPUT === '1') console.log('PDF regression artifacts: ' + folder);
  else {
    assert.equal(path.dirname(path.resolve(folder)), path.resolve(tmpdir()));
    assert.ok(path.basename(folder).startsWith('tempo-studio-pdf-test-'));
    rmSync(folder, { recursive: true, force: true });
  }
}
