/**
 * Row parsers — turn XLSX rows into typed records ready for upsert.
 *
 * One parser per upload table. Each parser:
 *   1. Maps column header names (via column-maps.ts) to our DB schema
 *   2. Sanitizes text + parses numbers/dates defensively
 *   3. Drops rows that lack a required identifier (e.g. creator_name, video_id)
 *   4. Computes a totalGmv summary so the UI can hard-block obvious mapping
 *      failures (e.g. all rows have $0 GMV → the GMV column wasn't found)
 */
import {
  COLUMN_MAPS,
  auditColumnMatches,
  findColumn,
  parseInteger,
  parseIntegerOrNull,
  parseNum,
  parseNumOrNull,
  parsePercentOrNull,
  parsePostDate,
  sanitizeText,
  type UploadTable,
} from './column-maps';

export interface ParseSummary {
  totalGmv: number;
  totalOrders: number;
  rowCount: number;
}

export interface ParseResult<T> {
  records: T[];
  summary: ParseSummary;
  matchedColumns: string[];
  missingColumns: string[];
  totalCols: number;
}

// ── Output record types ────────────────────────────────────────────

// Every field added in mig 120 is `number | null`. null means "this export
// didn't carry the column / the cell was blank" and must stay distinguishable
// from a real 0 — see the NULL-preserving parsers in column-maps.ts.
export interface CreatorPerformanceRecord {
  report_date: string;
  period_type: 'daily';
  brand: string;
  creator_name: string;
  gmv: number;
  refunds: number;
  orders: number;
  items_sold: number;
  items_refunded: number;
  aov: number;
  videos: number;
  live_streams: number;
  est_commission: number;
  samples_shipped: number;
  est_flat_fee: number;
  // GMV attribution split — the three components of `gmv` above.
  video_gmv: number | null;
  live_gmv: number | null;
  product_card_gmv: number | null;
  // Rates, in percentage points (5.93 means 5.93%).
  ctor: number | null;
  ctr: number | null;
  // Funnel + activity counts.
  total_sample_content: number | null;
  products_added_to_showcase: number | null;
  product_impressions: number | null;
  video_views: number | null;
  customers: number | null;
  products_sold: number | null;
}

export interface VideoPerformanceRecord {
  report_date: string;
  period_type: 'daily';
  brand: string;
  video_id: string;
  video_title: string;
  post_date: string | null;
  video_link: string;
  creator_name: string;
  product_name: string;
  product_id: string;
  gmv: number;
  orders: number;
  aov: number;
  avg_gmv_per_customer: number;
  items_sold: number;
  refunds: number;
  items_refunded: number;
  est_commission: number;
  est_flat_fee: number;
  // Engagement — null when the file's column is absent (never a fake 0).
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  // Funnel + quality (mig 120) — same null-means-absent contract.
  product_impressions: number | null;
  product_clicks: number | null;
  // Rates, in percentage points (3.65 means 3.65%).
  completion_rate: number | null;
  ctr: number | null;
  engagement_rate: number | null;
  // GMV per 1,000 video impressions.
  gpm: number | null;
}

// No video_link: upload_videos_atomic DERIVES the canonical permalink from
// creator_name + video_id (mig 119). The file's "Video link" column is an
// expiring signed CDN URL now, so it must never reach a write payload — it is
// still PARSED below, because it is the fallback source for the video id.
export interface VideoListRecord {
  video_id: string;
  brand: string;
  creator_name: string;
  video_name: string;
  post_date: string | null;
  total_gmv: number;
  affiliate_gmv: number;
  items_sold: number;
  orders: number;
  impressions: number;
  likes: number;
  comments: number;
  est_commission: number;
}

export interface ProductPerformanceRecord {
  report_date: string;
  brand: string;
  product_id: string;
  product_name: string;
  product_category: string;
  gmv: number;
  refunds: number;
  items_sold: number;
  items_refunded: number;
  orders: number;
  videos: number;
  live_streams: number;
  est_commission: number;
  samples_shipped: number;
  est_flat_fee: number;
  // Period totals (mig 120) — the export replaced its five `avg. daily …`
  // columns with these. null means the column wasn't in this file.
  videos_with_sales: number | null;
  live_streams_with_sales: number | null;
  creators_posted_content: number | null;
  creators_with_sales: number | null;
  customers: number | null;
  total_sample_content: number | null;
  product_impressions: number | null;
  product_clicks: number | null;
  // Rates, in percentage points (1.71 means 1.71%).
  ctor: number | null;
  ctr: number | null;
}

// ── Helper: column audit + summary boilerplate ─────────────────────

function auditCols(rows: Record<string, unknown>[], table: UploadTable) {
  if (rows.length === 0) return { matched: [] as string[], missing: [] as string[], totalCols: 0 };
  const totalCols = Object.keys(COLUMN_MAPS[table]).length;
  const audit = auditColumnMatches(rows[0], table);
  return { ...audit, totalCols };
}

// ── Parsers ─────────────────────────────────────────────────────────

export function parseCreatorRows(
  rows: Record<string, unknown>[],
  brand: string,
  reportDate: string
): ParseResult<CreatorPerformanceRecord> {
  const audit = auditCols(rows, 'creator_performance');

  let totalGmv = 0;
  let totalOrders = 0;

  const records: CreatorPerformanceRecord[] = [];
  for (const row of rows) {
    const creatorName = sanitizeText(findColumn(row, 'creator_name', 'creator_performance')).toLowerCase();
    if (!creatorName) continue;
    const gmv     = parseNum(findColumn(row, 'gmv', 'creator_performance'));
    const orders  = parseInteger(findColumn(row, 'orders', 'creator_performance'));
    totalGmv += gmv;
    totalOrders += orders;
    records.push({
      report_date: reportDate,
      period_type: 'daily',
      brand,
      creator_name: creatorName,
      gmv,
      refunds:                       parseNum(findColumn(row, 'refunds', 'creator_performance')),
      orders,
      items_sold:                    parseInteger(findColumn(row, 'items_sold', 'creator_performance')),
      items_refunded:                parseInteger(findColumn(row, 'items_refunded', 'creator_performance')),
      aov:                           parseNum(findColumn(row, 'aov', 'creator_performance')),
      videos:                        parseInteger(findColumn(row, 'videos', 'creator_performance')),
      live_streams:                  parseInteger(findColumn(row, 'live_streams', 'creator_performance')),
      est_commission:                parseNum(findColumn(row, 'est_commission', 'creator_performance')),
      samples_shipped:               parseInteger(findColumn(row, 'samples_shipped', 'creator_performance')),
      est_flat_fee:                  parseNum(findColumn(row, 'est_flat_fee', 'creator_performance')),
      // mig 120 — NULL-preserving (see column-maps.ts). `gmv` above stays the
      // total; these three are its live/video/product-card components.
      video_gmv:                     parseNumOrNull(findColumn(row, 'video_gmv', 'creator_performance')),
      live_gmv:                      parseNumOrNull(findColumn(row, 'live_gmv', 'creator_performance')),
      product_card_gmv:              parseNumOrNull(findColumn(row, 'product_card_gmv', 'creator_performance')),
      ctor:                          parsePercentOrNull(findColumn(row, 'ctor', 'creator_performance')),
      ctr:                           parsePercentOrNull(findColumn(row, 'ctr', 'creator_performance')),
      total_sample_content:          parseIntegerOrNull(findColumn(row, 'total_sample_content', 'creator_performance')),
      products_added_to_showcase:    parseIntegerOrNull(findColumn(row, 'products_added_to_showcase', 'creator_performance')),
      product_impressions:           parseIntegerOrNull(findColumn(row, 'product_impressions', 'creator_performance')),
      video_views:                   parseIntegerOrNull(findColumn(row, 'video_views', 'creator_performance')),
      customers:                     parseIntegerOrNull(findColumn(row, 'customers', 'creator_performance')),
      products_sold:                 parseIntegerOrNull(findColumn(row, 'products_sold', 'creator_performance')),
    });
  }

  return {
    records,
    summary: { totalGmv, totalOrders, rowCount: records.length },
    matchedColumns: audit.matched,
    missingColumns: audit.missing,
    totalCols: audit.totalCols,
  };
}

/** Engagement cell: NULL when the file lacks the column ("no data for this
 *  day"), a real number (junk → 0) when the column is present. */
function parseEngagement(
  row: Record<string, unknown>,
  key: 'views' | 'likes' | 'comments' | 'shares',
): number | null {
  const raw = findColumn(row, key, 'video_performance');
  return raw === undefined ? null : parseInteger(raw);
}

export function parseVideoRows(
  rows: Record<string, unknown>[],
  brand: string,
  reportDate: string
): ParseResult<VideoPerformanceRecord> {
  const audit = auditCols(rows, 'video_performance');

  let totalGmv = 0;
  let totalOrders = 0;

  const records: VideoPerformanceRecord[] = [];
  for (const row of rows) {
    const videoId = String(findColumn(row, 'video_id', 'video_performance') ?? '').trim();
    const creatorName = sanitizeText(findColumn(row, 'creator_name', 'video_performance')).toLowerCase();
    if (!videoId || !creatorName) continue;
    const gmv = parseNum(findColumn(row, 'gmv', 'video_performance'));
    const orders = parseInteger(findColumn(row, 'orders', 'video_performance'));
    totalGmv += gmv;
    totalOrders += orders;
    records.push({
      report_date: reportDate,
      period_type: 'daily',
      brand,
      video_id: videoId,
      video_title:          sanitizeText(findColumn(row, 'video_title', 'video_performance')).slice(0, 500),
      post_date:            parsePostDate(findColumn(row, 'post_date', 'video_performance')),
      video_link:           sanitizeText(findColumn(row, 'video_link', 'video_performance')).slice(0, 1000),
      creator_name:         creatorName,
      product_name:         sanitizeText(findColumn(row, 'product_name', 'video_performance')).slice(0, 500),
      product_id:           String(findColumn(row, 'product_id', 'video_performance') ?? '').trim(),
      gmv,
      orders,
      aov:                  parseNum(findColumn(row, 'aov', 'video_performance')),
      avg_gmv_per_customer: parseNum(findColumn(row, 'avg_gmv_per_customer', 'video_performance')),
      items_sold:           parseInteger(findColumn(row, 'items_sold', 'video_performance')),
      refunds:              parseNum(findColumn(row, 'refunds', 'video_performance')),
      items_refunded:       parseInteger(findColumn(row, 'items_refunded', 'video_performance')),
      est_commission:       parseNum(findColumn(row, 'est_commission', 'video_performance')),
      est_flat_fee:         parseNum(findColumn(row, 'est_flat_fee', 'video_performance')),
      views:                parseEngagement(row, 'views'),
      likes:                parseEngagement(row, 'likes'),
      comments:             parseEngagement(row, 'comments'),
      shares:               parseEngagement(row, 'shares'),
      // mig 120 — NULL-preserving (see column-maps.ts).
      product_impressions:  parseIntegerOrNull(findColumn(row, 'product_impressions', 'video_performance')),
      product_clicks:       parseIntegerOrNull(findColumn(row, 'product_clicks', 'video_performance')),
      completion_rate:      parsePercentOrNull(findColumn(row, 'completion_rate', 'video_performance')),
      ctr:                  parsePercentOrNull(findColumn(row, 'ctr', 'video_performance')),
      engagement_rate:      parsePercentOrNull(findColumn(row, 'engagement_rate', 'video_performance')),
      gpm:                  parseNumOrNull(findColumn(row, 'gpm', 'video_performance')),
    });
  }

  return {
    records,
    summary: { totalGmv, totalOrders, rowCount: records.length },
    matchedColumns: audit.matched,
    missingColumns: audit.missing,
    totalCols: audit.totalCols,
  };
}

export function parseVideoListRows(
  rows: Record<string, unknown>[],
  brand: string
): ParseResult<VideoListRecord> {
  const audit = auditCols(rows, 'videos');

  // Pull the real TikTok video id. Prefer the "Video ID" column (always the
  // 19-digit id); only fall back to scraping it from the link. The fallback
  // also handles photo/carousel posts (/photo/<id>), not just /video/<id>.
  // CDN links (.../video/tos/...) carry no real id, so for those the column is
  // the only way — which is exactly the case the old URL-only path dropped.
  function extractVideoIdFromUrl(url: string): string | null {
    const m = String(url || '').match(/\/(?:video|photo)\/(\d+)/);
    return m ? m[1] : null;
  }

  let totalGmv = 0;
  let totalOrders = 0;

  const records: VideoListRecord[] = [];
  for (const row of rows) {
    const videoLink = sanitizeText(findColumn(row, 'video_link', 'videos')).slice(0, 1000);
    const idColumn = String(findColumn(row, 'video_id', 'videos') ?? '').trim();
    const videoId = /^\d+$/.test(idColumn) ? idColumn : extractVideoIdFromUrl(videoLink);
    if (!videoId) continue;
    const creatorName = sanitizeText(findColumn(row, 'creator_name', 'videos')).toLowerCase();
    if (!creatorName) continue;
    const total_gmv = parseNum(findColumn(row, 'total_gmv', 'videos'));
    const affiliate_gmv = parseNum(findColumn(row, 'affiliate_gmv', 'videos'));
    const orders = parseInteger(findColumn(row, 'orders', 'videos'));
    totalGmv += total_gmv;
    totalOrders += orders;
    records.push({
      video_id:       videoId,
      brand,
      creator_name:   creatorName,
      video_name:     sanitizeText(findColumn(row, 'video_name', 'videos')).slice(0, 500),
      // videoLink is deliberately NOT emitted — see VideoListRecord. It is
      // read above only to recover the video id when the id column is absent.
      post_date:      parsePostDate(findColumn(row, 'post_date', 'videos')),
      total_gmv,
      affiliate_gmv,
      items_sold:     parseInteger(findColumn(row, 'items_sold', 'videos')),
      orders,
      impressions:    parseInteger(findColumn(row, 'impressions', 'videos')),
      likes:          parseInteger(findColumn(row, 'likes', 'videos')),
      comments:       parseInteger(findColumn(row, 'comments', 'videos')),
      est_commission: parseNum(findColumn(row, 'est_commission', 'videos')),
    });
  }

  return {
    records,
    summary: { totalGmv, totalOrders, rowCount: records.length },
    matchedColumns: audit.matched,
    missingColumns: audit.missing,
    totalCols: audit.totalCols,
  };
}

export function parseProductRows(
  rows: Record<string, unknown>[],
  brand: string,
  reportDate: string
): ParseResult<ProductPerformanceRecord> {
  const audit = auditCols(rows, 'product_performance');

  let totalGmv = 0;
  let totalOrders = 0;

  const records: ProductPerformanceRecord[] = [];
  for (const row of rows) {
    const productId = String(findColumn(row, 'product_id', 'product_performance') ?? '').trim();
    if (!productId || productId.length < 5) continue;
    const gmv = parseNum(findColumn(row, 'gmv', 'product_performance'));
    const orders = parseInteger(findColumn(row, 'orders', 'product_performance'));
    totalGmv += gmv;
    totalOrders += orders;
    records.push({
      report_date: reportDate,
      brand,
      product_id: productId,
      product_name:                  sanitizeText(findColumn(row, 'product_name', 'product_performance')).slice(0, 500),
      product_category:              sanitizeText(findColumn(row, 'product_category', 'product_performance')).slice(0, 200),
      gmv,
      refunds:                       parseNum(findColumn(row, 'refunds', 'product_performance')),
      items_sold:                    parseInteger(findColumn(row, 'items_sold', 'product_performance')),
      items_refunded:                parseInteger(findColumn(row, 'items_refunded', 'product_performance')),
      orders,
      videos:                        parseInteger(findColumn(row, 'videos', 'product_performance')),
      live_streams:                  parseInteger(findColumn(row, 'live_streams', 'product_performance')),
      est_commission:                parseNum(findColumn(row, 'est_commission', 'product_performance')),
      samples_shipped:               parseInteger(findColumn(row, 'samples_shipped', 'product_performance')),
      est_flat_fee:                  parseNum(findColumn(row, 'est_flat_fee', 'product_performance')),
      // mig 120 — NULL-preserving (see column-maps.ts). These are the period
      // totals that replaced the export's five removed `avg. daily …` columns.
      videos_with_sales:             parseIntegerOrNull(findColumn(row, 'videos_with_sales', 'product_performance')),
      live_streams_with_sales:       parseIntegerOrNull(findColumn(row, 'live_streams_with_sales', 'product_performance')),
      creators_posted_content:       parseIntegerOrNull(findColumn(row, 'creators_posted_content', 'product_performance')),
      creators_with_sales:           parseIntegerOrNull(findColumn(row, 'creators_with_sales', 'product_performance')),
      customers:                     parseIntegerOrNull(findColumn(row, 'customers', 'product_performance')),
      total_sample_content:          parseIntegerOrNull(findColumn(row, 'total_sample_content', 'product_performance')),
      product_impressions:           parseIntegerOrNull(findColumn(row, 'product_impressions', 'product_performance')),
      product_clicks:                parseIntegerOrNull(findColumn(row, 'product_clicks', 'product_performance')),
      ctor:                          parsePercentOrNull(findColumn(row, 'ctor', 'product_performance')),
      ctr:                           parsePercentOrNull(findColumn(row, 'ctr', 'product_performance')),
    });
  }

  return {
    records,
    summary: { totalGmv, totalOrders, rowCount: records.length },
    matchedColumns: audit.matched,
    missingColumns: audit.missing,
    totalCols: audit.totalCols,
  };
}
