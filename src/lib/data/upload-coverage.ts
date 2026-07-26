/**
 * The coverage ledger's data layer: what rows exist per brand-day, and which of
 * those days are lying to us.
 *
 * Two production failures this exists to make visible:
 *
 *   1. Six brands stopped uploading on 2026-07-09 and nothing said so for ten
 *      days. A quiet brand and a broken pipeline look identical unless something
 *      asserts the day was EXPECTED.
 *   2. A per-chunk guard stranded days at exact 5,000-row multiples — cosrx
 *      7/15-7/21, lemme 7/14 + 7/21, jiyu 7/17. Those days HAVE rows, so every
 *      pre-existing freshness signal reports them green. cosrx 2026-07-16 holds
 *      5,000 of the ~40,600 rows that day should have, and until now the product
 *      had no way to say so.
 *
 * The status decision lives here rather than in SQL on purpose: it is policy,
 * it changes as we learn, and it needs to be readable by whoever is staring at
 * a red cell at 8am wondering whether to trust it.
 *
 * ── The rule that governs every choice below ────────────────────────────────
 * A heuristic that cries wolf is worse than no heuristic, because the operator
 * learns to ignore red. Every detector here was measured against real July data
 * before it shipped (see MEASURED, below), and the tuning that survived is the
 * tuning that produced zero false positives — not the tuning that caught the
 * most cells.
 */

/* ────────────────────────────────────────────────────────────────────────── */
/*  Contract types — mirrored by src/components/upload/coverage-types.ts       */
/* ────────────────────────────────────────────────────────────────────────── */

export type CoverageTypeKey = 'creator' | 'video' | 'product';
/**
 * `awaiting`  — inside the publication window; not judged yet, NOT a failure.
 * `unverified` — rows landed, but this brand-table has no history to judge them
 *                against, so "complete" would be a claim we cannot support.
 */
export type CoverageStatus =
  | 'complete'
  | 'partial'
  | 'missing'
  | 'not_expected'
  | 'awaiting'
  | 'unverified';
/** Mirrors ingestion_runs.status (migration 116). */
export type RunStatus = 'running' | 'complete' | 'failed' | 'partial';
export type CoverageSource = 'api' | 'upload';

export interface CellState {
  status: CoverageStatus;
  rows: number | null;
  expectedRows: number | null;
  reason?: string;
  runStatus?: RunStatus;
  source?: CoverageSource;
  /**
   * Only meaningful on `partial`. False when the verdict rests on the trailing
   * baseline alone because no days after this one exist yet — the newest
   * columns. Measured: a trailing-only collapse produces 10 false positives in
   * a 30-day window (July 4th, and the lemme/neurogum step-downs), which is why
   * the both-sides guard exists at all. Those cells are still shown — three true
   * positives are trailing-only-catchable — but the UI must render them at
   * lower visual weight and say the verdict is unconfirmed.
   */
  confirmed?: boolean;
}

export interface CoverageCell {
  date: string;
  types: Partial<Record<CoverageTypeKey, CellState>>;
}

export interface CoverageBrand {
  slug: string;
  label: string;
  expected: boolean;
  cells: CoverageCell[];
  /**
   * Additive, not part of the four-field core contract. Which TikTok export
   * layout this brand appears to be on — see deriveExportLayout() for why this
   * is metadata and NOT an input to `expected`.
   */
  exportLayout?: ExportLayout;
}

export interface CoverageResponse {
  days: string[];
  brands: CoverageBrand[];
  generatedAt: string;
  warnings?: string[];
  /**
   * The newest day that is JUDGED. Columns after it render `awaiting` and are
   * excluded from every tally. Shipped in the payload rather than re-derived on
   * the client, so the grid, the health strip and the drawer cannot disagree
   * about where the frontier is.
   */
  judgeThrough: string;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  The three reports that make a complete brand-day                          */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Report key -> fact table. The mapping is the same for every brand under BOTH
 * TikTok export layouts, which is the reason the split/merged distinction does
 * not change this list; see deriveExportLayout().
 *
 * `label` is the report's name, NOT its filename token — the video report still
 * exports as *_Video_List_* and the product report as *_Transaction_Analysis_*
 * (EXPECTED_DAILY_FILES in @/lib/upload/file-detection is the authority on
 * filenames).
 */
export const COVERAGE_TABLES: { key: CoverageTypeKey; table: string; label: string }[] = [
  { key: 'creator', table: 'creator_performance', label: 'Creator Data' },
  { key: 'video',   table: 'video_performance',   label: 'Video Data' },
  { key: 'product', table: 'product_performance', label: 'Transaction Analysis' },
];

export const TABLE_TO_TYPE: Record<string, CoverageTypeKey> = Object.fromEntries(
  COVERAGE_TABLES.map((t) => [t.table, t.key]),
) as Record<string, CoverageTypeKey>;

export const TYPE_TO_TABLE: Record<CoverageTypeKey, string> = Object.fromEntries(
  COVERAGE_TABLES.map((t) => [t.key, t.table]),
) as Record<CoverageTypeKey, string>;

export const TYPE_LABEL: Record<CoverageTypeKey, string> = Object.fromEntries(
  COVERAGE_TABLES.map((t) => [t.key, t.label]),
) as Record<CoverageTypeKey, string>;

/* ────────────────────────────────────────────────────────────────────────── */
/*  Detector tuning                                                           */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * MEASURED against production, 2026-07-26, over the 1,014 populated
 * (brand, table, day) cells in the trailing 30 days:
 *
 *   first cut  (collapse judged on the trailing median alone)
 *       11 true positives, 10 false positives — a 48% false-positive rate.
 *       Every false positive was one of two shapes: the July 4th holiday dip
 *       (lemme + neurogum creator, ~59% of a normal day) and a genuine
 *       step-down in level that the trailing median had not caught up with yet
 *       (neurogum + lemme video, 7/3-7/6, where the level really did move from
 *       ~250/day to ~83/day and stayed there).
 *
 *   shipped    (collapse must be contradicted by the days on BOTH sides)
 *       11 true positives, 0 false positives.
 *
 * The single change that did it: a day is only "collapsed" if the days AFTER it
 * also disagree with it. A level shift is confirmed by its future; a truncated
 * upload is contradicted by it. See CHUNK_SIZE / COLLAPSE_RATIO below.
 */

/**
 * The upload path chunks by measured payload bytes, but the guard that stranded
 * these days counted rows, and it counted them in 5,000s. A count that lands
 * exactly on a multiple of 5,000 did not come from creators; it came from an
 * arithmetic boundary.
 *
 * The base rate is what makes this safe: across 70 days of production history
 * there are exactly SEVEN counts that are exact multiples of 5,000, and all
 * seven are known-broken days. Natural counts do not land on round numbers.
 */
const CHUNK_SIZE = 5000;

/**
 * How close a baseline has to sit to the row count before it CONTRADICTS the
 * chunk-multiple signature — i.e. before we accept that this brand's real volume
 * genuinely is that number.
 *
 * MEASURED (2026-07-26, 5,648 brand-table-days over 297 days of fact-table
 * history): exactly 7 cells land on an exact multiple of 5,000, and all 7 are
 * known-broken days (cosrx creator 7/15, 7/16, 7/17, 7/21; jiyu creator 7/17;
 * lemme creator 7/14, 7/21). Zero legitimate days. The closest a natural count
 * has ever come is physicians_choice creator 7/12 at 14,950 — fifty rows, 0.33%,
 * away. So the multiple alone is very nearly proof; this tolerance exists only
 * to spare a brand whose steady state ever parks ON a multiple.
 *
 * It is deliberately checked against the MAX of the available baselines, never
 * "any baseline within 10%". cosrx creator 2026-07-16 is a real 5,000-row stub
 * whose own 28-day median sits inside 10% of 5,000 — and drifts to EXACTLY
 * 5,000 as the window rolls forward — so an any-baseline reading suppresses a
 * true positive, and does so as a function of when you happen to look.
 */
const CONTRADICT_TOLERANCE = 0.1;

/**
 * How many of the newest columns are inside the publication window: rendered,
 * but not judged. See coverageAnchors().
 *
 * MEASURED (2026-07-26, 7 established actively-uploading brands, 45 report-dates
 * 2026-06-10..07-24, 1,308 brand-day-table observations):
 *   · lag is NEVER 0 — the minimum observed is 1, so a "today" column is
 *     structurally impossible and is correctly excluded already.
 *   · no first write has EVER landed before 10:00 ET (n=1,015; 10h:139, 11h:221,
 *     12h:327, 13h:137, 14h:76, 15h:94, 16h:21), so the today-1 column is empty
 *     for every brand every morning even when the pipeline is perfectly healthy.
 *     At W=0 (the previous behaviour) all 8 uploading brands read "Silent 1d" in
 *     red and the Current lane read 0 — a guaranteed daily false alarm.
 *   · W=1 would judge day D at the end of D+1, and on 6 of 45 report-dates ZERO
 *     active brands had data by then (per-cell false-red 17% creator / 15%
 *     product / 29% video).
 *   · W=2 judges day D at the end of D+2, where 0 of 45 report-dates had zero
 *     coverage. Per-cell false-red falls to 2.2% creator / 1.6% product.
 *
 * CALIBRATION CAVEAT, deliberately written down rather than left to rot: the
 * 45-day sample pools two regimes. For 2026-06-15..07-20 every session reached
 * D-1 (lag exactly 1); the last three sessions each stopped at D-2. And the six
 * dates behind the W=1 argument are dates on which the OPERATOR ran no upload
 * session (06-14, 06-20, 07-21, 07-23 had zero first-writes) — so under W=2 a
 * skipped upload day cannot surface at all, which is a real cost, not a free
 * margin. If the fleet's rolling p90 lag returns to 1, drop this to 1.
 *
 * Video is at p90 5 / max 11, far worse than creator and product. That is the
 * post-2026-07-13 merged-export incident, not a publication property (pre-merge
 * video p90 was 1), so the window is NOT widened to hide it — fix the ingest.
 */
export const AWAITING_WINDOW_DAYS = 2;

/**
 * The ledger's two frontiers, derived from the wall clock and nothing else.
 *
 * `renderThrough` is the newest COLUMN (today-1; today is excluded because lag
 * is never 0). `judgeThrough` is the newest column that gets a verdict.
 *
 * Both come from the same normalised `now`, so the gap between them is
 * invariantly AWAITING_WINDOW_DAYS and the UTC day-flip (20:00 ET / 17:00 PT — a
 * window in which no first write has ever occurred) cannot open or close one
 * without the other.
 *
 * ⚠️ Do NOT replace this with a data-derived anchor such as "the newest
 * report_date any active brand has". That rule is self-referential and fails
 * exactly when it matters most: if every brand stops uploading, the anchor walks
 * backward in lockstep with the outage, the newest column is always the last
 * good day, and the ledger renders GREEN straight through a total blackout —
 * reintroducing the ten-day silent failure in a strictly worse form, because now
 * the page actively asserts everything is current. The same objection kills the
 * per-brand variant (a dark brand becomes its own judge and is never late) and
 * the max-across-brands variant (one early uploader makes everyone else red).
 * Never derive the anchor from the data it is meant to police. Judgement may be
 * moved EARLIER by peer evidence (see peerReady) because that can only ever add
 * an alarm; it may never be moved later.
 */
export function coverageAnchors(now: Date = new Date()): {
  renderThrough: string;
  judgeThrough: string;
} {
  const base = new Date(now);
  base.setUTCHours(12, 0, 0, 0);
  const render = new Date(base);
  render.setUTCDate(render.getUTCDate() - 1);
  const judge = new Date(base);
  judge.setUTCDate(judge.getUTCDate() - 1 - AWAITING_WINDOW_DAYS);
  return {
    renderThrough: render.toISOString().slice(0, 10),
    judgeThrough: judge.toISOString().slice(0, 10),
  };
}

/**
 * The collapse threshold. A day under 60% of its neighbours is not a slow
 * Tuesday. Measured headroom on real data: the worst legitimate dip in 30 days
 * (lemme creator, July 4th) is 60% of its trailing median, and the mildest true
 * positive (cosrx creator 7/21, 25,000 rows) is 63% — which is why 7/21 is
 * caught by the chunk detector rather than this one. The two detectors overlap
 * deliberately; neither is asked to be the sole line of defence.
 */
const COLLAPSE_RATIO = 0.6;

/**
 * Below this many rows a day, the count is too noisy to judge. product_performance
 * runs 1-110 rows per brand-day (it is a product catalogue, not a creator list),
 * so a swing from 17 products to 10 is a Tuesday, not a truncated file. Without
 * this floor the product column would be the loudest and least useful thing on
 * the page.
 */
const MIN_BASELINE = 50;

/**
 * A 'running' row older than this is a job that died without saying so.
 * Exported so the per-cell sentence and the page-level warning count can never
 * disagree about what "dead" means.
 */
export const DEAD_RUN_MS = 60 * 60 * 1000;

/* ────────────────────────────────────────────────────────────────────────── */
/*  Classification                                                            */
/* ────────────────────────────────────────────────────────────────────────── */

export interface RunFacts {
  status: RunStatus;
  source: CoverageSource;
  rowsWritten: number | null;
  rowsExpected: number | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface CellFacts {
  date: string;
  /** Rows present for this (brand, table, day). null and 0 both mean nothing landed. */
  rows: number | null;
  /** Median of the 7 days before, positive days only, null under 3 samples. */
  trailingMedian: number | null;
  /** Median of the 7 days after, same rules. */
  leadingMedian: number | null;
  /** Newest ingestion_runs row for this cell, if the ledger has one. */
  run?: RunFacts | null;
  /** True when the brand is archived in brands_v2. */
  brandArchived?: boolean;
  /** First day this brand ever produced rows in this table, if known. */
  firstDate?: string | null;
  /**
   * Newest day that gets a verdict — from coverageAnchors(). REQUIRED, so that a
   * second call site cannot quietly compute its own offset: the drawer builds
   * CellFacts independently of the grid, there is no test suite in this repo,
   * and the compiler is therefore the only thing standing between the two.
   */
  judgeThrough: string;
  /**
   * True when this (table, date) is already proven ingestible because all but at
   * most one of the brands that produce this table have rows for it. Lets a
   * single brand's hole surface at D+2 instead of waiting out the calendar
   * floor. Monotone: it can only move judgement EARLIER, never later, so it
   * cannot mask an outage the way a data-derived anchor would.
   */
  peerReady?: boolean;
  /** Injected for testability; defaults to now. */
  now?: Date;
}

const fmt = (n: number) => n.toLocaleString('en-US');

function describeAge(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 90) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/**
 * Decide one cell.
 *
 * Order matters and is not arbitrary:
 *   not_expected beats everything (never accuse a brand of missing a day it was
 *   never asked for), then missing (zero rows is zero rows regardless of what
 *   the run ledger claims), then the two partial detectors, then complete.
 *
 * `reason` is a sentence, not a code. It is rendered verbatim, and it exists so
 * the operator can decide whether to re-upload WITHOUT opening the database.
 */
export function classifyCell(f: CellFacts): CellState {
  const rows = f.rows ?? 0;
  const run = f.run ?? null;
  const now = f.now ?? new Date();

  // Expectation comes from the run ledger when it exists (it knows what the file
  // claimed), otherwise from the local baseline. Never invented.
  const expectedRows =
    run?.rowsExpected ?? f.trailingMedian ?? f.leadingMedian ?? null;

  // ── not_expected ────────────────────────────────────────────────────────
  // Archived suppresses MISSING — a brand nobody uploads for is not a failure —
  // but it must NOT suppress PARTIAL on a day that actually has rows. cosrx was
  // archived 2026-07-25 while still holding rows through 07-23, and this gate
  // firing before the detectors rendered 6 of the 11 known-broken days in the
  // window as a grey "no upload is expected". An archived brand still on the
  // page still has its history read; hiding the evidence that its July days are
  // truncated is the opposite of what this surface is for.
  if (f.brandArchived && rows <= 0) {
    return {
      status: 'not_expected',
      rows: f.rows,
      expectedRows: null,
      reason: 'Brand is archived in brands_v2 — no upload is expected.',
    };
  }
  if (f.firstDate && f.date < f.firstDate) {
    return {
      status: 'not_expected',
      rows: f.rows,
      expectedRows: null,
      reason: `This brand's first data for this report is ${f.firstDate}; the day predates it.`,
    };
  }

  // The run ledger's own words, reused by both the missing and partial branches.
  const runReason = describeRun(run, now);

  // ── awaiting ────────────────────────────────────────────────────────────
  // Inside the publication window and nothing has landed. This DEFERS the
  // verdict, it never cancels it: the day is judged unconditionally from
  // judgeThrough+1 onward and stays red forever after until it is filled.
  //
  // Note the rows <= 0 guard — a day inside the window that DID land is judged
  // normally, so an early upload still gets its verdict and the chunk-multiple
  // rule still runs on it. `awaiting` only ever replaces a would-be `missing`.
  //
  // peerReady overrides the calendar floor when the day is already proven
  // ingestible by the rest of the fleet.
  if (f.date > f.judgeThrough && rows <= 0 && !f.peerReady) {
    return {
      status: 'awaiting',
      rows: f.rows,
      expectedRows,
      // Deliberately NOT "TikTok has not published this yet". What we measured
      // is first-WRITE time, which mixes TikTok's publication, the operator's
      // session time and whether a session ran at all. Say only what is known.
      reason:
        `Not ingested yet. No upload for a given day has ever landed before ~10:00 ET the ` +
        `following morning, and the fleet median is one day, so this day is not judged until ` +
        `${addDays(f.judgeThrough, 1)}.`,
    };
  }

  // ── missing ─────────────────────────────────────────────────────────────
  // Zero rows is zero rows. A run row saying 'complete' over an empty day is
  // itself evidence of a lie, so we surface its words rather than trusting them.
  if (rows <= 0) {
    return {
      status: 'missing',
      rows: f.rows === null ? null : 0,
      expectedRows,
      ...(runReason ? { reason: runReason } : {}),
      ...(run ? { runStatus: run.status, source: run.source } : {}),
    };
  }

  // ── partial ─────────────────────────────────────────────────────────────
  const reasons: string[] = [];

  // (a) Direct evidence from the write side.
  if (runReason) reasons.push(runReason);

  const trail = f.trailingMedian;
  const lead = f.leadingMedian;

  // (b) The chunk-multiple rule. BASELINE-FREE by design, and that is the whole
  //     point of it.
  //
  //     The previous form required `rows < 0.9 * max(trailing, leading)`, which
  //     misses on the newest column — where leading is structurally null — any
  //     time the stub lands ABOVE a trailing median that is itself too low.
  //     Measured: 3 of the 11 known partials (lemme creator 7/14 @5,000 vs
  //     trailing 277; cosrx creator 7/15 @15,000 vs 5,060; cosrx creator 7/17
  //     @20,000 vs 15,000) rendered COMPLETE on the morning they mattered, and
  //     were only caught days later once a leading median existed.
  //
  //     The trailing median is too low for two compounding reasons: the
  //     2026-07-12 export change moved several brands 10-30x in a day, and — on
  //     7/17 — the trailing median IS the 7/15 stub. A baseline contaminated by
  //     the very failure being hunted cannot referee it, which is why stacking
  //     another median on top (a 28-day gap-independent one was tried and
  //     scored) changes nothing: replayed over 2,270 cells it was byte-for-byte
  //     identical to doing nothing, because after the export change the 28-day
  //     median reports the OLD level and is LOWER still.
  //
  //     So the multiple stands on its own and a baseline may only VETO it. See
  //     CONTRADICT_TOLERANCE for the base rate that licenses this (7 exact
  //     multiples in 5,648 brand-table-days, all 7 broken) and for why the veto
  //     tests the MAX baseline rather than any of them.
  if (rows % CHUNK_SIZE === 0 && rows >= CHUNK_SIZE) {
    const veto = maxDefined(trail, lead);
    const contradicted =
      veto !== null && Math.abs(rows - veto) <= CONTRADICT_TOLERANCE * rows;
    if (!contradicted) {
      reasons.push(
        veto !== null
          ? `${fmt(rows)} rows is an exact multiple of the ${fmt(CHUNK_SIZE)}-row upload chunk; ` +
              `this brand normally lands ${fmt(veto)}.`
          : `${fmt(rows)} rows is an exact multiple of the ${fmt(CHUNK_SIZE)}-row upload chunk. ` +
              `No day in production history has ever legitimately landed on one.`,
      );
    }
  }

  // (c) The collapse detector wants BOTH sides to agree the day is an outlier.
  //     Trailing alone flags every step-down in level; requiring the days after
  //     to disagree too takes that to zero in hindsight.
  //
  //     On the newest columns there is no "after" yet, and treating absent-as-
  //     agreeing silently switches the guard off on exactly the mornings an
  //     operator reads: measured, that is 10 false positives inside a 30-day
  //     window (the July 4th dip on lemme/neurogum creator, and a real
  //     lemme/neurogum video step-down from ~250/day to ~85/day). Suppressing
  //     the detector there is not an option either — cosrx video 7/20 and 7/21
  //     and leefar_nutrition video 7/22 are catchable on day one ONLY this way,
  //     and none is a chunk multiple.
  //
  //     So an unconfirmed verdict is shown, and labelled as one.
  //
  //     `basis = trail ?? lead`: gating on trailing alone meant a cell with a
  //     leading median but no trailing one was never collapse-checked at all —
  //     which is why a brand's first days rendered green regardless of count.
  const basis = trail ?? lead;
  let collapseConfirmed = true;
  if (
    basis !== null &&
    basis >= MIN_BASELINE &&
    rows < COLLAPSE_RATIO * basis &&
    (lead === null || rows < COLLAPSE_RATIO * lead)
  ) {
    collapseConfirmed = lead !== null;
    const pct = Math.round((rows / basis) * 100);
    reasons.push(
      `${fmt(rows)} rows is ${pct}% of the ${fmt(basis)} this brand normally lands.` +
        (collapseConfirmed
          ? ''
          : ' No days after this one have landed yet, so nothing has confirmed it.'),
    );
  }

  if (reasons.length > 0) {
    return {
      status: 'partial',
      rows,
      expectedRows,
      reason: reasons.join(' '),
      confirmed: collapseConfirmed,
      ...(run ? { runStatus: run.status, source: run.source } : {}),
    };
  }

  // ── unverified ──────────────────────────────────────────────────────────
  // Rows landed and nothing flagged them — but with no baseline in either
  // direction, "nothing flagged them" is not evidence of anything. Calling this
  // complete would assert a check that never ran. The sharpest illustration is a
  // newly onboarded brand's product file at 1 row/day: either a correct
  // one-product catalogue or a catastrophically truncated file, and no signal on
  // this page can tell the operator which.
  if (trail === null && lead === null && !run) {
    return {
      status: 'unverified',
      rows,
      expectedRows,
      reason:
        `${fmt(rows)} rows landed, but this brand has no history for this report yet — ` +
        `there is nothing to judge the count against. Not verified, not a problem.`,
    };
  }

  // ── complete ────────────────────────────────────────────────────────────
  return {
    status: 'complete',
    rows,
    expectedRows,
    ...(run ? { runStatus: run.status, source: run.source } : {}),
  };
}

/**
 * Which (table, date) pairs are already proven ingestible by the fleet.
 *
 * A day inside the awaiting window is proven once all but at most one of the
 * brands that produce that table have rows for it — so a single brand's hole
 * surfaces at D+2 rather than waiting out the calendar floor.
 *
 * "All but one", not "any peer": 15-17% of cells land at lag 2 while some peer
 * landed at lag 1, so a first-peer trigger would be a false-red generator.
 *
 * Monotone: this can only move judgement EARLIER. That is what makes it safe
 * where a data-derived ANCHOR is not — it can add an alarm, never remove one, so
 * a dark fleet can never use it to declare itself current.
 *
 * Lives here rather than in either route because the grid and the drawer must
 * reach the same verdict for the same cell, and the drawer builds its facts
 * independently.
 */
export function computePeerReady(
  rows: Iterable<{ brand_slug: string; target_table: string; report_date: unknown; row_count: number | null }>,
  dates: string[],
): Set<string> {
  const PEER_MIN_FLEET = 3;
  const landedByTableDate = new Map<string, Set<string>>();
  const producersByTable = new Map<string, Set<string>>();
  for (const r of rows) {
    if ((r.row_count ?? 0) <= 0) continue;
    const date = String(r.report_date);
    const producers = producersByTable.get(r.target_table) ?? new Set<string>();
    producers.add(r.brand_slug);
    producersByTable.set(r.target_table, producers);
    const k = `${r.target_table}|${date}`;
    const landed = landedByTableDate.get(k) ?? new Set<string>();
    landed.add(r.brand_slug);
    landedByTableDate.set(k, landed);
  }
  const ready = new Set<string>();
  for (const [table, producers] of producersByTable) {
    if (producers.size < PEER_MIN_FLEET) continue;
    for (const date of dates) {
      const k = `${table}|${date}`;
      if ((landedByTableDate.get(k)?.size ?? 0) >= producers.size - 1) ready.add(k);
    }
  }
  return ready;
}

/** Calendar-day arithmetic on an ISO date, no timezone in play. */
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Turn an ingestion_runs row into a sentence, or null when the run is clean.
 * A 'running' row is deliberately NOT clean: either a job is in flight and the
 * count below is not final, or it died and nobody was told. Both are worth a
 * different sentence, and both are worth the operator's attention.
 */
function describeRun(run: RunFacts | null, now: Date): string | null {
  if (!run) return null;
  const started = new Date(run.startedAt);
  const age = now.getTime() - started.getTime();

  if (run.status === 'running') {
    return age > DEAD_RUN_MS
      ? `An ingestion run started ${describeAge(age)} ago and never finished — the job died mid-flight ` +
          `(a serverless timeout writes no error, only a run that stops advancing).`
      : `An ingestion run started ${describeAge(age)} ago and is still in flight; this count is not final.`;
  }
  if (run.status === 'failed') {
    return `The ingestion run failed${run.error ? `: ${truncate(run.error, 180)}` : '.'}`;
  }
  if (run.status === 'partial') {
    return `The ingestion run reported itself partial${run.error ? `: ${truncate(run.error, 180)}` : '.'}`;
  }
  // status === 'complete' — still short-written?
  if (
    run.rowsWritten !== null &&
    run.rowsExpected !== null &&
    run.rowsWritten < run.rowsExpected
  ) {
    return `The run wrote ${fmt(run.rowsWritten)} of an expected ${fmt(run.rowsExpected)} rows.`;
  }
  return null;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function maxDefined(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  TikTok export layout                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

export type ExportLayout = 'merged' | 'split' | 'unknown';

/**
 * Which TikTok export layout a brand is on, derived — never hardcoded.
 *
 * WHY IT IS DERIVABLE AT ALL: the pre-merge Video List export carries real
 * engagement numbers into `videos.impressions`. The merged export does not.
 * Migration 110's dual-ingest muddies this by writing an impressions-FREE
 * identity row into `videos` on every video_performance upload, so "wrote to
 * videos recently" proves nothing — only "wrote IMPRESSIONS recently" separates
 * the layouts.
 *
 * WHY IT IS NOT USED TO DECIDE `expected`: verified against production
 * 2026-07-26, a 3-day window on the last impressions-bearing write reproduces
 * the hand-verified 2026-07-25 list exactly (jiyu, lemme, leefar_nutrition,
 * leefar_supplements, leefar_us on the split export; bondie, catakor,
 * physicians_choice on the merged one). A 7-day window does not — it calls
 * physicians_choice "split", because PC migrated on ~2026-07-23 and its last
 * impressions write was 7/22. A signal whose answer flips on a ±1 day tuning
 * choice is not a signal to hang a brand's expected reports on: if it lands the
 * wrong way it tells the operator a brand is fine when it is not.
 *
 * It also would not change the answer if it were rock solid. All three tracked
 * reports land in the same three tables under BOTH layouts — jiyu and the
 * leefar stores are on the split export today and still write full
 * video_performance every day. The layout changes which FILE the operator
 * fetches, not which table has to fill.
 *
 * So this ships as metadata on the brand row plus a response warning, and the
 * expected-type decision is made from observed history instead (see the route:
 * a report is expected of a brand when that brand has actually produced it).
 */
const SPLIT_EXPORT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export function deriveExportLayout(
  lastImpressionsWrite: string | null,
  lastVideosWrite: string | null,
  now: Date = new Date(),
): ExportLayout {
  // No recent `videos` traffic at all: the brand is not uploading, so the layout
  // is unknowable — "no impressions lately" and "no uploads lately" produce the
  // identical signal. Returning 'merged' here would be a guess dressed as a
  // fact, and it would be wrong for exactly the six frozen brands this page
  // exists to surface (their last write was 2026-07-10; nothing since can tell
  // us which export they would ship if they resumed).
  if (!lastVideosWrite) return 'unknown';
  const videosAge = now.getTime() - new Date(lastVideosWrite).getTime();
  if (videosAge > SPLIT_EXPORT_WINDOW_MS) return 'unknown';

  if (!lastImpressionsWrite) return 'merged';
  return now.getTime() - new Date(lastImpressionsWrite).getTime() <= SPLIT_EXPORT_WINDOW_MS
    ? 'split'
    : 'merged';
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Row shapes returned by the RPCs (migration 123)                           */
/* ────────────────────────────────────────────────────────────────────────── */

export interface CoverageMatrixRow {
  brand_slug: string;
  target_table: string;
  report_date: string;
  row_count: number;
  trailing_median: number | null;
  leading_median: number | null;
  is_live: boolean;
  refreshed_at: string;
}

export interface CoverageBoundsRow {
  brand_slug: string;
  target_table: string;
  first_date: string;
  last_date: string;
  median_rows: number | null;
  days_present: number;
}

export interface ExportLayoutRow {
  brand_slug: string;
  last_videos_write: string | null;
  last_impressions_write: string | null;
}

export interface IngestionRunRow {
  id: string;
  source: CoverageSource;
  brand_slug: string;
  target_table: string;
  report_date: string | null;
  status: RunStatus;
  rows_written: number | null;
  rows_expected: number | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export const cellKey = (brand: string, table: string, date: string) =>
  `${brand}|${table}|${date}`;

/** ingestion_runs -> RunFacts, newest run wins (rows are ordered by caller). */
export function toRunFacts(r: IngestionRunRow): RunFacts {
  return {
    status: r.status,
    source: r.source,
    rowsWritten: r.rows_written,
    rowsExpected: r.rows_expected,
    error: r.error,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  };
}

/** UTC-anchored ISO day list, newest first. Report dates are calendar dates. */
export function buildDayList(days: number, endDate: Date): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(endDate);
    d.setUTCDate(endDate.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
