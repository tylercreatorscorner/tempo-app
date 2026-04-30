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
  parseNum,
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
  avg_daily_products_with_sales: number;
  videos: number;
  live_streams: number;
  est_commission: number;
  samples_shipped: number;
  est_flat_fee: number;
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
}

export interface VideoListRecord {
  video_id: string;
  brand: string;
  creator_name: string;
  video_name: string;
  video_link: string;
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
  avg_daily_customers: number;
  avg_daily_creators_with_sales: number;
  avg_daily_creators_posted: number;
  avg_daily_videos_with_sales: number;
  avg_daily_lives_with_sales: number;
  videos: number;
  live_streams: number;
  est_commission: number;
  samples_shipped: number;
  est_flat_fee: number;
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
      avg_daily_products_with_sales: parseNum(findColumn(row, 'avg_daily_products_with_sales', 'creator_performance')),
      videos:                        parseInteger(findColumn(row, 'videos', 'creator_performance')),
      live_streams:                  parseInteger(findColumn(row, 'live_streams', 'creator_performance')),
      est_commission:                parseNum(findColumn(row, 'est_commission', 'creator_performance')),
      samples_shipped:               parseInteger(findColumn(row, 'samples_shipped', 'creator_performance')),
      est_flat_fee:                  parseNum(findColumn(row, 'est_flat_fee', 'creator_performance')),
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

  function extractVideoId(url: string): string | null {
    const m = String(url || '').match(/\/video\/(\d+)/);
    return m ? m[1] : null;
  }

  let totalGmv = 0;
  let totalOrders = 0;

  const records: VideoListRecord[] = [];
  for (const row of rows) {
    const videoLink = sanitizeText(findColumn(row, 'video_link', 'videos')).slice(0, 1000);
    const videoId = extractVideoId(videoLink);
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
      video_link:     videoLink,
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
      avg_daily_customers:           parseNum(findColumn(row, 'avg_daily_customers', 'product_performance')),
      avg_daily_creators_with_sales: parseNum(findColumn(row, 'avg_daily_creators_with_sales', 'product_performance')),
      avg_daily_creators_posted:     parseNum(findColumn(row, 'avg_daily_creators_posted', 'product_performance')),
      avg_daily_videos_with_sales:   parseNum(findColumn(row, 'avg_daily_videos_with_sales', 'product_performance')),
      avg_daily_lives_with_sales:    parseNum(findColumn(row, 'avg_daily_lives_with_sales', 'product_performance')),
      videos:                        parseInteger(findColumn(row, 'videos', 'product_performance')),
      live_streams:                  parseInteger(findColumn(row, 'live_streams', 'product_performance')),
      est_commission:                parseNum(findColumn(row, 'est_commission', 'product_performance')),
      samples_shipped:               parseInteger(findColumn(row, 'samples_shipped', 'product_performance')),
      est_flat_fee:                  parseNum(findColumn(row, 'est_flat_fee', 'product_performance')),
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
