/**
 * The Data Pipeline coverage contract — the shape the ledger renders.
 *
 * These types mirror `GET /api/upload/coverage` and the per-cell detail read,
 * which are implemented in the data layer (src/app/api/upload/coverage/*). This
 * file is the UI's copy of that agreement; it deliberately declares almost
 * everything past the four core fields as optional so a response from a
 * slightly older or newer route degrades to "less detail" instead of a crash.
 *
 * THE POINT OF THE FOUR STATES: complete / partial / missing / not_expected are
 * four different facts and the UI must never blur them.
 *
 *   complete     — the day's rows landed and the count was verified after write
 *   partial      — rows landed but the count is short of what this brand+table
 *                  normally produces (the 5,000-row chunk-multiple signature)
 *   missing      — the day should exist and nothing is there
 *   not_expected — the brand is archived/paused, or the day predates it. This
 *                  is NOT a failure and must never render as one.
 */

/** The three reports that make up a complete brand-day. */
export type CoverageTypeKey = 'creator' | 'video' | 'product';

export type CoverageStatus = 'complete' | 'partial' | 'missing' | 'not_expected';

/** Mirrors ingestion_runs.status (migration 116). */
export type RunStatus = 'running' | 'complete' | 'failed' | 'partial';

/** Which pipeline wrote the rows. 'api' is aspirational today — no shop has
 *  authorized yet — so in practice every cell is 'upload'. */
export type CoverageSource = 'api' | 'upload';

export interface CellState {
  status: CoverageStatus;
  rows: number | null;
  expectedRows: number | null;
  /** The sentence that saves an afternoon, e.g. "5,000 rows is an exact chunk
   *  multiple; brand median is 40,606." Present on `partial`, sometimes on
   *  `missing`. Rendered verbatim — never paraphrased in the UI. */
  reason?: string;
  runStatus?: RunStatus;
  source?: CoverageSource;
}

export interface CoverageCell {
  date: string;
  types: Partial<Record<CoverageTypeKey, CellState>>;
}

/**
 * Which TikTok export layout the brand appears to be on, derived by the data
 * layer from whether its recent `videos` writes still carry impressions.
 *
 * It does NOT change which tables must fill — all three reports land in the
 * same three tables under either layout — but it changes which FILE the
 * operator has to fetch, so the repair guidance in the drawer depends on it.
 */
export type ExportLayout = 'merged' | 'split' | 'unknown';

export interface CoverageBrand {
  slug: string;
  label: string;
  /** False for archived/offboarded brands (COSRX today). Their whole row is
   *  "not expected" — greyed, never counted as a failure. */
  expected: boolean;
  cells: CoverageCell[];
  exportLayout?: ExportLayout;
}

export interface CoverageResponse {
  /** ISO dates, newest first (the ledger reverses them for display). */
  days: string[];
  brands: CoverageBrand[];
  generatedAt: string;
  warnings?: string[];
}

// ── Per-cell detail ────────────────────────────────────────────────────────

/** One ingestion_runs row (migration 116), camelCased. */
export interface CoverageRun {
  id: string;
  source: CoverageSource;
  status: RunStatus;
  rowsWritten: number | null;
  rowsExpected: number | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

/** The last activity_log upload entry for this (brand, table, date). */
export interface CoverageActivity {
  createdAt: string;
  uploadedBy: string | null;
  rowCount: number | null;
}

export interface CoverageCellDetail {
  brand: string;
  brandLabel?: string;
  type: CoverageTypeKey;
  typeLabel?: string;
  table?: string;
  date: string;
  state: CellState;
  /** What this brand+table normally lands in a day — the number that makes
   *  "5,000" obviously wrong. */
  medianRows: number | null;
  runs?: CoverageRun[];
  lastUpload?: CoverageActivity | null;
  /** The surrounding fortnight's row counts. 348 sitting next to 9,705 / 9,590
   *  / 9,853 needs no explanation — this is the shape of the argument. */
  neighbours?: { date: string; rows: number | null }[];
}

// ── Display helpers (pure — shared by the ledger, the drawer and the health
// header so the vocabulary can't drift between them) ───────────────────────

export const COVERAGE_TYPES: { key: CoverageTypeKey; label: string; short: string }[] = [
  { key: 'creator', label: 'Creator Data', short: 'C' },
  { key: 'video', label: 'Video Data', short: 'V' },
  { key: 'product', label: 'Transaction Analysis', short: 'P' },
];

export const STATUS_LABEL: Record<CoverageStatus, string> = {
  complete: 'Complete',
  partial: 'Partial',
  missing: 'Missing',
  not_expected: 'Not expected',
};

/**
 * The filename token TikTok ships each report under. Kept in step with
 * EXPECTED_DAILY_FILES in @/lib/upload/file-detection — the video report still
 * exports as Video_List and the product report as Transaction_Analysis, so the
 * export token is NOT the report's display name.
 */
export const EXPORT_TOKEN: Record<CoverageTypeKey, string> = {
  creator: 'Creator_Data',
  video: 'Video_List',
  product: 'Transaction_Analysis',
};

/**
 * The exact filename an operator should look for when repairing a cell:
 * {BrandToken}_{TypeToken}_{YYYYMMDD}.xlsx (Cata-Kor -> CataKor).
 *
 * The VIDEO token depends on the brand's export layout. On the merged export
 * (TikTok's change of ~2026-07-13) the file named Video_List carries the video
 * performance content. Brands still on the SPLIT export ship both files, and
 * there the one that feeds video_performance is Video_Data — naming Video_List
 * for those brands sends the operator to the wrong report, which is precisely
 * the confusion this page exists to remove. Layout unknown falls back to the
 * merged name, which is correct for most of the roster.
 */
export function expectedFilename(
  brandLabel: string,
  type: CoverageTypeKey,
  date: string,
  layout: ExportLayout = 'unknown',
): string {
  const brandToken = brandLabel.replace(/[^A-Za-z0-9]/g, '');
  const token = type === 'video' && layout === 'split' ? 'Video_Data' : EXPORT_TOKEN[type];
  return `${brandToken}_${token}_${date.replace(/-/g, '')}.xlsx`;
}

/** "Jul 17" — the ledger and drawer's shared date voice. UTC-anchored, matching
 *  the rest of the upload surface (TikTok report dates are calendar dates, not
 *  instants, so a local-time render shifts them a day for half the world). */
export function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * The worst status in a cell — drives the cell's background tint and the
 * brand-row summary. Order is deliberate: a missing report outranks a partial
 * one, and 'not_expected' can never outrank a real state (a brand that stopped
 * producing one report still has two real ones).
 */
const SEVERITY: Record<CoverageStatus, number> = {
  missing: 3,
  partial: 2,
  complete: 1,
  not_expected: 0,
};

export function worstStatus(cell: CoverageCell): CoverageStatus {
  let worst: CoverageStatus = 'not_expected';
  for (const { key } of COVERAGE_TYPES) {
    const s = cell.types[key]?.status;
    if (s && SEVERITY[s] > SEVERITY[worst]) worst = s;
  }
  return worst;
}

/** Cell states in fixed C/V/P order, with absent types treated as unknown
 *  rather than invented as complete. */
export function cellStates(cell: CoverageCell): { key: CoverageTypeKey; label: string; short: string; state: CellState | null }[] {
  return COVERAGE_TYPES.map((t) => ({ ...t, state: cell.types[t.key] ?? null }));
}
