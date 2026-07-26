import { classifyCell, coverageAnchors, AWAITING_WINDOW_DAYS } from '../src/lib/data/upload-coverage';

const JT = '2026-07-23'; // judgeThrough for the fixtures below
let pass = 0, fail = 0;
function check(name: string, got: string, want: string) {
  if (got === want) { pass++; console.log(`  ok   ${name} -> ${got}`); }
  else { fail++; console.log(`  FAIL ${name} -> ${got}, expected ${want}`); }
}

// ── The 11 known-broken days, judged DAY ONE (leading median null) ─────────
console.log('\nKnown partials, day-one regime (no leading median):');
const dayOne: [string, number, number | null][] = [
  ['cosrx creator 7/15', 15000, 5060],
  ['cosrx creator 7/16', 5000, 15000],
  ['cosrx creator 7/17', 20000, 15000],
  ['cosrx creator 7/21', 25000, 39427],
  ['jiyu creator 7/17', 5000, 9176],
  ['lemme creator 7/14', 5000, 277],
  ['lemme creator 7/21', 5000, 8633],
  ['cosrx video 7/20', 15531, 54313],
  ['cosrx video 7/21', 3017, 53789],
  ['leefar_nutrition video 7/20', 369, 9768],
  ['leefar_nutrition video 7/22', 348, 9768],
];
for (const [name, rows, trail] of dayOne) {
  const s = classifyCell({ date: '2026-07-20', rows, trailingMedian: trail, leadingMedian: null, judgeThrough: JT });
  check(name, s.status, 'partial');
}

// ── Controls: must NOT flag ───────────────────────────────────────────────
console.log('\nControls (must stay complete):');
check('normal day', classifyCell({ date: '2026-07-20', rows: 9500, trailingMedian: 9700, leadingMedian: 9600, judgeThrough: JT }).status, 'complete');
check('brand genuinely at 5,000/day', classifyCell({ date: '2026-07-20', rows: 5000, trailingMedian: 5000, leadingMedian: 4980, judgeThrough: JT }).status, 'complete');
check('near-miss 14,950', classifyCell({ date: '2026-07-20', rows: 14950, trailingMedian: 15000, leadingMedian: 14900, judgeThrough: JT }).status, 'complete');
check('July 4 dip, confirmed by lead', classifyCell({ date: '2026-07-04', rows: 223, trailingMedian: 373, leadingMedian: 370, judgeThrough: JT }).status, 'complete');

// ── The archived gate must no longer hide a partial ───────────────────────
console.log('\nArchived gate:');
check('archived + 5,000 stub', classifyCell({ date: '2026-07-20', rows: 5000, trailingMedian: 40606, leadingMedian: null, brandArchived: true, judgeThrough: JT }).status, 'partial');
check('archived + no rows', classifyCell({ date: '2026-07-20', rows: 0, trailingMedian: null, leadingMedian: null, brandArchived: true, judgeThrough: JT }).status, 'not_expected');

// ── The awaiting window ───────────────────────────────────────────────────
console.log('\nAwaiting window:');
check('empty day inside window', classifyCell({ date: '2026-07-25', rows: null, trailingMedian: 9000, leadingMedian: null, judgeThrough: JT }).status, 'awaiting');
check('empty day PAST window', classifyCell({ date: '2026-07-22', rows: null, trailingMedian: 9000, leadingMedian: null, judgeThrough: JT }).status, 'missing');
check('empty day in window, peers landed', classifyCell({ date: '2026-07-25', rows: null, trailingMedian: 9000, leadingMedian: null, peerReady: true, judgeThrough: JT }).status, 'missing');
check('stub INSIDE window still judged', classifyCell({ date: '2026-07-25', rows: 5000, trailingMedian: 40606, leadingMedian: null, judgeThrough: JT }).status, 'partial');

// ── unverified ────────────────────────────────────────────────────────────
console.log('\nNo-baseline days (were rendering verified-green):');
check('bondie creator day 1', classifyCell({ date: '2026-07-01', rows: 1710, trailingMedian: null, leadingMedian: null, judgeThrough: JT }).status, 'unverified');
check('bondie product 1 row', classifyCell({ date: '2026-07-01', rows: 1, trailingMedian: null, leadingMedian: null, judgeThrough: JT }).status, 'unverified');

// ── collapse basis = trail ?? lead ────────────────────────────────────────
console.log('\nCollapse with no trailing median (was never checked at all):');
check('lead-only collapse', classifyCell({ date: '2026-07-02', rows: 200, trailingMedian: null, leadingMedian: 1700, judgeThrough: JT }).status, 'partial');

// ── anchors ───────────────────────────────────────────────────────────────
const a = coverageAnchors(new Date('2026-07-26T18:00:00Z'));
check('renderThrough', a.renderThrough, '2026-07-25');
check('judgeThrough', a.judgeThrough, '2026-07-23');
const b = coverageAnchors(new Date('2026-07-26T02:00:00Z'));
check('anchor stable across UTC evening', b.judgeThrough, '2026-07-23');
console.log(`\nAWAITING_WINDOW_DAYS=${AWAITING_WINDOW_DAYS}`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
