/**
 * Column maps for TikTok Shop XLSX exports.
 *
 * Ported verbatim from the old Netlify dashboard's upload.html (v1.13.0). The
 * exact column names below are how TikTok labels columns in their CSV/XLSX
 * exports — they don't match our DB column names, so we look them up by
 * possible header name (case-insensitive).
 *
 * Critical: TikTok renamed "Affiliate-attributed GMV" -> "Creator-attributed GMV"
 * in early 2026. We accept both; the old name is the fallback.
 */

export type UploadTable =
  | 'creator_performance'
  | 'video_performance'
  | 'videos'
  | 'product_performance';

export type ColumnMap = Record<string, string[]>;

export const COLUMN_MAPS: Record<UploadTable, ColumnMap> = {
  creator_performance: {
    creator_name:                    ['creator name'],
    gmv:                             ['creator-attributed gmv', 'affiliate-attributed gmv'],
    refunds:                         ['refunds'],
    orders:                          ['attributed orders'],
    // TikTok renamed this column ~Apr 2026 alongside the GMV rename.
    // New name first, legacy as fallback.
    items_sold:                      ['creator-attributed items sold', 'affiliate-attributed items sold'],
    items_refunded:                  ['items refunded'],
    aov:                             ['aov'],
    avg_daily_products_with_sales:   ['avg. daily products sold'],
    videos:                          ['videos'],
    live_streams:                    ['live streams'],
    est_commission:                  ['est. commission'],
    samples_shipped:                 ['samples shipped'],
    est_flat_fee:                    ['est. flat fee'],
  },
  video_performance: {
    video_title:                     ['video title'],
    video_id:                        ['video id'],
    post_date:                       ['post date'],
    video_link:                      ['video link'],
    creator_name:                    ['creator name'],
    product_name:                    ['product name'],
    product_id:                      ['product id'],
    // TikTok renamed this column ~Apr 2026 (matching the creator-data rename
    // earlier this year). New name first, legacy as fallback.
    gmv:                             ['creator video-attributed gmv', 'affiliate video-attributed gmv', 'video-attributed gmv'],
    orders:                          ['video-attributed orders'],
    aov:                             ['aov'],
    avg_gmv_per_customer:            ['avg. gmv per customer'],
    items_sold:                      ['video-attributed items sold'],
    refunds:                         ['refunds'],
    items_refunded:                  ['items refunded'],
    est_commission:                  ['est. commission'],
    est_flat_fee:                    ['est. flat fee'],
    // Per-day engagement (added 2026-07 — the export carried these all along;
    // we were discarding them). Parsed as NULL when the column is absent, so
    // old files never write a fake 0.
    views:                           ['video views'],
    likes:                           ['likes'],
    comments:                        ['comments'],
    shares:                          ['shares'],
  },
  videos: {
    // Prefer the real Video ID column when present. TikTok's exports include a
    // "Video ID" column; the parser used to derive the id by regex-scraping the
    // link, which silently dropped any row whose link wasn't the canonical
    // tiktok.com/.../video/<id> form (e.g. CDN links .../video/tos/..., photo
    // posts). Reading the column directly — like the Video file already does —
    // fixes that. URL extraction stays as a fallback.
    video_id:                        ['video id', 'video_id', 'shoppable video id'],
    video_name:                      ['video name'],
    video_link:                      ['video link'],
    post_date:                       ['video post date'],
    creator_name:                    ['creator username'],
    total_gmv:                       ['gmv'],
    // TikTok's export sometimes has a trailing space on this column header.
    items_sold:                      ['affiliate items sold ', 'affiliate items sold'],
    affiliate_gmv:                   ['affiliate shoppable video gmv'],
    orders:                          ['affiliate orders'],
    impressions:                     ['shoppable video impressions'],
    likes:                           ['shoppable video likes'],
    comments:                        ['shoppable video comments'],
    est_commission:                  ['est. commission'],
  },
  product_performance: {
    product_name:                    ['product name'],
    product_id:                      ['product id'],
    product_category:                ['product category'],
    // TikTok renamed this column ~Mar/Apr 2026 (matching the creator-data
    // rename pattern). Old map only had the legacy name -> product uploads
    // were silently landing with $0 GMV for weeks. New name first.
    gmv:                             ['creator-attributed gmv', 'affiliate-attributed gmv'],
    refunds:                         ['refunds'],
    // Renamed alongside GMV in the same TikTok update. Old map missed the new name
    // → product items_sold has been silently $0 for the same window as product GMV.
    items_sold:                      ['creator-attributed items sold', 'affiliate-attributed items sold'],
    items_refunded:                  ['items refunded'],
    orders:                          ['attributed orders'],
    avg_daily_customers:             ['avg. daily customers'],
    avg_daily_creators_with_sales:   ['avg. daily creators with sales'],
    avg_daily_creators_posted:       ['avg. daily creators posted content'],
    avg_daily_videos_with_sales:     ['avg. daily videos with sales'],
    avg_daily_lives_with_sales:      ['avg. daily live streams with sales'],
    videos:                          ['videos'],
    live_streams:                    ['live streams'],
    est_commission:                  ['est. commission'],
    samples_shipped:                 ['samples shipped'],
    est_flat_fee:                    ['est. flat fee'],
  },
};

/**
 * Look up a value in a row by mapped column key.
 * Tries each candidate name case-insensitively against the row's keys.
 */
export function findColumn(
  row: Record<string, unknown>,
  mappingKey: string,
  table: UploadTable
): unknown {
  const candidates = COLUMN_MAPS[table]?.[mappingKey] ?? [];
  const rowKeys = Object.keys(row);
  for (const name of candidates) {
    const found = rowKeys.find(k => k.toLowerCase() === name.toLowerCase());
    if (found !== undefined) return row[found];
  }
  return undefined;
}

/**
 * Audit which mapped columns were found vs missing for a row. Used to surface
 * "matched 11/13 columns" messages in the upload log so the user can spot
 * column-mapping issues immediately.
 */
export function auditColumnMatches(
  row: Record<string, unknown>,
  table: UploadTable
): { matched: string[]; missing: string[] } {
  const matched: string[] = [];
  const missing: string[] = [];
  const rowKeys = Object.keys(row);
  for (const [key, candidates] of Object.entries(COLUMN_MAPS[table])) {
    const has = candidates.some(name =>
      rowKeys.some(k => k.toLowerCase() === name.toLowerCase())
    );
    (has ? matched : missing).push(key);
  }
  return { matched, missing };
}

// ── Cell parsers ────────────────────────────────────────────────────

/** Parse a number-ish cell. Handles "$1,234.56", "--", "", null. */
export function parseNum(val: unknown): number {
  if (val === null || val === undefined || val === '' || val === '--') return 0;
  const str = String(val).replace(/[$,%]/g, '').trim();
  const num = parseFloat(str);
  return Number.isNaN(num) ? 0 : num;
}

/** Parse an integer-ish cell. */
export function parseInteger(val: unknown): number {
  if (val === null || val === undefined || val === '' || val === '--') return 0;
  const str = String(val).replace(/[$,]/g, '').trim();
  const num = parseInt(str, 10);
  return Number.isNaN(num) ? 0 : num;
}

/**
 * Strip control chars and surrogate pairs (emojis) from text cells before
 * they hit Postgres. The old tool was hitting JSON encoding errors when
 * creator names had emojis (and silently lost data).
 *
 * Allows ASCII printable + Latin-1 supplement + Latin Extended A/B + IPA +
 * Vietnamese (covers virtually all real creator names without breaking JSON).
 */
export function sanitizeText(text: unknown): string {
  if (text === null || text === undefined || text === '') return '';
  let str = String(text);
  // Control chars (\x00-\x1F and \x7F)
  str = str.replace(/[ -]/g, '');
  // Surrogate pairs (emojis use these)
  str = str.replace(/[\uD800-\uDFFF]/g, '');
  // Unicode non-characters
  str = str.replace(/[￾￿]/g, '');
  // Whitelist: ASCII printable + Latin-1 + Latin Extended A/B + IPA + Vietnamese
  // Ranges:  -~,  -ÿ, Ā-ſ, ƀ-ɏ, ɐ-ʯ, Ḁ-ỿ
  str = str.replace(/[^ -~ -ÿĀ-ſƀ-ɏɐ-ʯḀ-ỿ]/g, '');
  return str.trim();
}

/**
 * Parse a date-ish cell to YYYY-MM-DD or null.
 * Handles: ISO strings, JS Date objects, TikTok's "MM/DD/YYYY" exports, "--".
 */
export function parsePostDate(val: unknown): string | null {
  if (!val || val === '--') return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const date = new Date(str);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
}
