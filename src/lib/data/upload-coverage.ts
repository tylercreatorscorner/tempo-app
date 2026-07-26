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
export type CoverageStatus = 'complete' | 'partial' | 'missing' | 'not_expected';
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
 * How far below the local baseline an exact chunk multiple has to sit before we
 * call it. Loose on purpose — the chunk-multiple signature is already carrying
 * almost all of the evidence, and this only exists to spare a brand whose real
 * volume happens to hover near a multiple of 5,000.
 */
const CHUNK_RATIO = 0.9;

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
  if (f.brandArchived) {
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

  // (b) Heuristics. These run even when a run row says 'complete', because the
  //     bug that motivated this page did exactly that: every 5,000-row chunk
  //     succeeded on its own terms while the day as a whole was truncated.
  const chunkBaseline = maxDefined(f.trailingMedian, f.leadingMedian);
  if (
    rows % CHUNK_SIZE === 0 &&
    rows >= CHUNK_SIZE &&
    chunkBaseline !== null &&
    rows < CHUNK_RATIO * chunkBaseline
  ) {
    reasons.push(
      `${fmt(rows)} rows is an exact multiple of the ${fmt(CHUNK_SIZE)}-row upload chunk; ` +
        `this brand normally lands ${fmt(chunkBaseline)}.`,
    );
  }

  // The collapse detector needs BOTH sides to agree the day is an outlier.
  // Trailing alone flags every step-down in level (10 false positives measured);
  // requiring the days after to disagree too took that to zero without losing a
  // single true positive. When there is no "after" yet — the newest days of the
  // ledger — trailing has to stand alone, which is the correct bias for the day
  // an operator is actually looking at.
  const trail = f.trailingMedian;
  const lead = f.leadingMedian;
  if (
    trail !== null &&
    trail >= MIN_BASELINE &&
    rows < COLLAPSE_RATIO * trail &&
    (lead === null || rows < COLLAPSE_RATIO * lead)
  ) {
    const pct = Math.round((rows / trail) * 100);
    reasons.push(
      `${fmt(rows)} rows is ${pct}% of the ${fmt(trail)} this brand normally lands.`,
    );
  }

  if (reasons.length > 0) {
    return {
      status: 'partial',
      rows,
      expectedRows,
      reason: reasons.join(' '),
      ...(run ? { runStatus: run.status, source: run.source } : {}),
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
