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
    videos:                          ['videos'],
    live_streams:                    ['live streams'],
    est_commission:                  ['est. commission'],
    samples_shipped:                 ['samples shipped'],
    est_flat_fee:                    ['est. flat fee'],
    // ── Added 2026-07-25 (mig 120). TikTok has been sending these all along;
    // we were dropping them. Header strings verified against the real
    // Bondie_Creator_Data_20260722.xlsx export (23 columns, all matched).
    //
    // The GMV SPLIT is the headline: `gmv` above ("Creator-attributed GMV")
    // is the TOTAL, and these three are its components. Verified on the
    // 2026-07-22 Bondie file: total $6,438.91 = live $0.00 + video $6,410.61
    // + product card $28.30, exact to the cent on all 1,896 rows. Tempo had
    // zero live-vs-video attribution before this.
    video_gmv:                       ['creator video-attributed gmv', 'affiliate video-attributed gmv'],
    live_gmv:                        ['creator live-attributed gmv', 'affiliate live-attributed gmv'],
    product_card_gmv:                ['affiliate product card-attributed gmv', 'creator product card-attributed gmv'],
    // Rates. Stored as PERCENTAGE POINTS (the file says "5.93%" → 5.93).
    ctor:                            ['ctor'],
    ctr:                             ['ctr'],
    // Counts.
    total_sample_content:            ['total sample content'],
    products_added_to_showcase:      ['products added to showcase'],
    product_impressions:             ['product impressions'],
    video_views:                     ['video views'],
    customers:                       ['customers'],
    products_sold:                   ['products sold'],
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
    // ── Added 2026-07-25 (mig 120). Funnel + quality metrics the export has
    // always carried. Header strings verified against the real
    // Bondie_Video_Data_20260722.xlsx export.
    // NOTE: that file has NO "Product name" column (mapped above) — the
    // fallback stays because older exports and other shops still send it.
    product_impressions:             ['video product impressions'],
    product_clicks:                  ['video product clicks'],
    // Rates — PERCENTAGE POINTS ("3.65%" → 3.65). "Engagement" is a rate
    // despite the bare name: its definition row reads "likes, shares and
    // comments divided by total views", and the cells are "0.29%".
    completion_rate:                 ['completion rate'],
    ctr:                             ['ctr'],
    engagement_rate:                 ['engagement'],
    // GMV per 1,000 video impressions — money, arrives as "$9.19".
    gpm:                             ['video gpm'],
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
    videos:                          ['videos'],
    live_streams:                    ['live streams'],
    est_commission:                  ['est. commission'],
    samples_shipped:                 ['samples shipped'],
    est_flat_fee:                    ['est. flat fee'],
    // ── Added 2026-07-25 (mig 120). These REPLACE the five `avg. daily …`
    // headers TikTok stopped sending — the export now gives the period totals
    // directly ("Creators with sales" instead of "Avg. daily creators with
    // sales"). The dead map entries were removed in the same change; their DB
    // columns stay for history. Header strings verified against the real
    // Bondie_Transaction_Analysis_20260722.xlsx export (23 columns, all
    // matched).
    videos_with_sales:               ['videos with sales'],
    live_streams_with_sales:         ['live streams with sales'],
    creators_posted_content:         ['creators posted content'],
    creators_with_sales:             ['creators with sales'],
    customers:                       ['customers'],
    total_sample_content:            ['total sample content'],
    product_impressions:             ['product impressions'],
    product_clicks:                  ['product clicks'],
    // Rates — PERCENTAGE POINTS ("1.71%" → 1.71).
    ctor:                            ['ctor'],
    ctr:                             ['ctr'],
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

// ── NULL-preserving variants ────────────────────────────────────────
//
// House rule (post fake-$0 incident): a real 0 and "TikTok didn't send it"
// must stay distinguishable, so every column added in mig 120 parses through
// these instead of parseNum/parseInteger. They return null for all four
// "no value" shapes the exports produce:
//
//   undefined  the column isn't in this file at all (older export, other shop)
//   null / ''  the cell is blank
//   '--'       TikTok's own not-applicable placeholder (it really is in the
//              files — the 2026-07-22 Video Data export has '--' in Video
//              title / Post date / Video link / Product ID)
//
// Junk that isn't a number also becomes null rather than 0, because a metric
// silently reading 0 is exactly the failure mode these exist to prevent.

/** True for every cell shape that means "no value" (never 0). */
function isBlankCell(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string') {
    const t = val.trim();
    return t === '' || t === '--';
  }
  return false;
}

/** Money/decimal cell → number, or null when the export didn't send a value. */
export function parseNumOrNull(val: unknown): number | null {
  if (isBlankCell(val)) return null;
  const num = parseFloat(String(val).replace(/[$,%]/g, '').trim());
  return Number.isNaN(num) ? null : num;
}

/** Count cell → integer, or null when the export didn't send a value. */
export function parseIntegerOrNull(val: unknown): number | null {
  if (isBlankCell(val)) return null;
  const num = parseInt(String(val).replace(/[$,]/g, '').trim(), 10);
  return Number.isNaN(num) ? null : num;
}

/**
 * Rate cell → PERCENTAGE POINTS, or null when the export didn't send a value.
 *
 * Ground truth (Bondie exports, 2026-07-22): TikTok writes every rate as a
 * TEXT cell — "5.93%", "0.55%", "1.9%" — so SheetJS hands us the string even
 * with `raw: true`, and the number before the '%' is already in percentage
 * points. We store that verbatim: "5.93%" → 5.93, NOT 0.0593. Rates above
 * 100 are legitimate and must not be clamped (CTR maxes at 200 in that file).
 *
 * Deliberately NOT auto-scaling. If TikTok ever switches to real
 * percent-FORMATTED numeric cells, SheetJS would return the fraction (0.0593)
 * and this would store 0.0593 — visibly 100x low rather than silently wrong.
 * Guessing from magnitude is worse: a genuine 0.5% and a fraction 0.5 are
 * indistinguishable, so a "helpful" ×100 would corrupt real low rates. If the
 * cell type ever changes, fix it here explicitly and backfill.
 */
export function parsePercentOrNull(val: unknown): number | null {
  return parseNumOrNull(val);
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
