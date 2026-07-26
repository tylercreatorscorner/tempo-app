/**
 * Queue-time file-type sniffing — decide an upload's type from its HEADER ROW
 * instead of trusting the filename.
 *
 * Why: TikTok merged the "Video List" export into the "Video Data" schema
 * (~2026-07-13) while KEEPING the *_Video_List_*.xlsx filenames, and did it
 * brand by brand. detectFileType now maps that filename to Video Data (the
 * common case), so this sniff is the BACKSTOP rather than the rescue: it
 * catches the brands still on the PRE-merge layout, whose identically-named
 * file matches 3/20 columns against the Video Data map and 13/13 against the
 * Video List map, and switches them back.
 *
 * The sniff reads ONLY the header row (XLSX.read with sheetRows: 2 — cheap
 * even on large files) and scores it against all four COLUMN_MAPS. The
 * decision logic here is pure; the upload client owns state updates + chips.
 */
import * as XLSX from 'xlsx';
import { COLUMN_MAPS, auditColumnMatches, type UploadTable } from './column-maps';
import type { FileType } from './file-detection';

/** Auto-switch only when the evidence is lopsided: the other map matches at
 *  least SWITCH_MIN_BEST of its columns, the chosen map at most
 *  SWITCH_MAX_CHOSEN, and the gap is at least SWITCH_MIN_GAP. */
const SWITCH_MIN_BEST = 0.7;
const SWITCH_MAX_CHOSEN = 0.4;
const SWITCH_MIN_GAP = 0.3;

const TYPE_FOR_MAP_TABLE: Record<UploadTable, FileType> = {
  creator_performance: 'creator',
  video_performance: 'video',
  videos: 'videolist',
  product_performance: 'affiliateproduct',
};

const MAP_TABLE_FOR_TYPE: Partial<Record<FileType, UploadTable>> = {
  creator: 'creator_performance',
  video: 'video_performance',
  videolist: 'videos',
  affiliateproduct: 'product_performance',
};

export interface TypeScore {
  type: FileType;
  table: UploadTable;
  matched: number;
  total: number;
  ratio: number;
}

export type TypeSniffDecision =
  | { action: 'none' }
  /** `chosen` is null when the incoming type was 'unknown' (no map to compare). */
  | { action: 'switch'; to: FileType; best: TypeScore; chosen: TypeScore | null }
  | { action: 'ambiguous'; best: TypeScore; chosen: TypeScore };

/**
 * Read just the header row of an XLSX file. Returns null for a header-only or
 * empty sheet — callers must then leave the type unchanged. `sheetRows: 2`
 * stops SheetJS from materializing the whole grid, so this is safe to run at
 * queue time on every dropped file.
 */
export function extractHeaderRow(ab: ArrayBuffer): Record<string, unknown> | null {
  const workbook = XLSX.read(ab, { type: 'array', sheetRows: 2 });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) return null;
  // Same sheet_to_json options as the run-time parse, so the sniff's ratios
  // are identical to what the run-time cross-audit would compute.
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
  return rows[0] ?? null;
}

/**
 * Score a header row against all four column maps.
 *
 * Exported for the API ingestion path (src/lib/tiktok/compass.ts), which asks a
 * STRICTER question than the queue-time decision below: not "should I switch the
 * operator's chosen type?" but "is this the report I asked TikTok to build?".
 * That path has no human to adjudicate an ambiguous file, so it needs the raw
 * scores rather than the switch/ambiguous/none verdict.
 */
export function scoreAllTypes(headerRow: Record<string, unknown>): TypeScore[] {
  return (Object.keys(COLUMN_MAPS) as UploadTable[]).map(table => {
    const a = auditColumnMatches(headerRow, table);
    const total = a.matched.length + a.missing.length;
    return {
      table,
      type: TYPE_FOR_MAP_TABLE[table],
      matched: a.matched.length,
      total,
      ratio: total > 0 ? a.matched.length / total : 0,
    };
  });
}

/**
 * Score the header row against all four column maps and decide whether the
 * chosen (filename-detected or dropdown-selected) type should change.
 *
 * Decision table, with r(t) = matched/total for type t and best = argmax over
 * the OTHER types:
 *   1. chosen has no column map:
 *      - 'unknown'  → adopt the overall argmax when r(best) >= 0.7 (better
 *        than the guaranteed run-time "pick a type" error); else none.
 *      - 'product' (legacy Product List) → never auto-resolved.
 *   2. r(best) >= 0.7 AND r(chosen) >= 0.7 AND r(best) >= r(chosen) →
 *      AMBIGUOUS: never switch, warn naming both candidates. The extra
 *      r(best) >= r(chosen) guard keeps correctly-typed files quiet: an
 *      affiliate-product file scores ~10/13 ≈ 0.77 against the creator map
 *      every single day — warning on it when its own map matches ~19/19
 *      would train the operator to ignore warnings. A MIS-typed affiliate
 *      file (chosen=creator 0.77, best=product ~1.0) still warns.
 *   3. r(best) >= 0.7 AND r(chosen) <= 0.4 AND r(best) - r(chosen) >= 0.3 →
 *      SWITCH to best (e.g. a PRE-merge Video List file that the filename
 *      typed as Video Data: Video List 13/13 vs Video Data 3/20).
 *   4. Otherwise → none.
 */
export function resolveTypeFromHeaders(
  headerRow: Record<string, unknown>,
  chosenType: FileType,
): TypeSniffDecision {
  const scores = scoreAllTypes(headerRow);
  const chosenTable = MAP_TABLE_FOR_TYPE[chosenType];

  if (!chosenTable) {
    if (chosenType !== 'unknown') return { action: 'none' };
    const best = scores.reduce((m, s) => (s.ratio > m.ratio ? s : m));
    return best.ratio >= SWITCH_MIN_BEST
      ? { action: 'switch', to: best.type, best, chosen: null }
      : { action: 'none' };
  }

  const chosen = scores.find(s => s.table === chosenTable);
  if (!chosen) return { action: 'none' };
  const others = scores.filter(s => s.table !== chosenTable);
  const best = others.reduce((m, s) => (s.ratio > m.ratio ? s : m));

  if (best.ratio >= SWITCH_MIN_BEST && chosen.ratio >= SWITCH_MIN_BEST && best.ratio >= chosen.ratio) {
    return { action: 'ambiguous', best, chosen };
  }
  if (
    best.ratio >= SWITCH_MIN_BEST &&
    chosen.ratio <= SWITCH_MAX_CHOSEN &&
    best.ratio - chosen.ratio >= SWITCH_MIN_GAP
  ) {
    return { action: 'switch', to: best.type, best, chosen };
  }
  return { action: 'none' };
}
