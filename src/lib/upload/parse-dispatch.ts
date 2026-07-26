/**
 * One place that turns "a FileType plus a grid of XLSX rows" into records +
 * validation verdict.
 *
 * This used to live inside upload-client.tsx as a private `runTypeParser`. It
 * was lifted out when the API ingestion path (src/lib/tiktok/compass-ingest.ts)
 * needed the same mapping: a TikTok Compass export and a hand-downloaded
 * Seller Center export are the SAME file from the same warehouse, so they must
 * become records through the same parser and the same validator. A second copy
 * of this switch is a guarantee that one of the two paths silently rots the
 * next time TikTok renames a column.
 *
 * Pure — no DB, no next/headers, no React. Safe to import from a client
 * component, a route handler, or a tsx script.
 */
import type { FileType } from './file-detection';
import type { UploadTable } from './column-maps';
import {
  parseCreatorRows,
  parseProductRows,
  parseVideoListRows,
  parseVideoRows,
} from './parse-rows';
import {
  validateCreatorRecords,
  validateProductRecords,
  validateVideoRecords,
} from './validators';

export interface DispatchedParse {
  /** null when the FileType has no parser (unknown, legacy 'product'). */
  table: UploadTable | null;
  records: unknown[];
  matchedColumns: string[];
  missingColumns: string[];
  totalCols: number;
  /** Hard blocks. A non-empty list must abort the write, on either path. */
  errors: string[];
  warnings: string[];
  totalGmv: number;
  totalOrders: number;
}

/**
 * `reportDate` is ignored for 'videolist' — the `videos` registry is keyed by
 * (video_id, brand) with no report_date column, which is why that branch runs
 * no validator either (it has no GMV-column failure signature to test).
 */
export function parseRowsForType(
  type: FileType,
  rows: Record<string, unknown>[],
  brand: string,
  reportDate: string,
): DispatchedParse {
  if (type === 'creator') {
    const p = parseCreatorRows(rows, brand, reportDate);
    const v = validateCreatorRecords(p.records);
    return {
      table: 'creator_performance',
      records: p.records,
      matchedColumns: p.matchedColumns,
      missingColumns: p.missingColumns,
      totalCols: p.totalCols,
      errors: v.errors,
      warnings: v.warnings,
      totalGmv: v.totalGmv,
      totalOrders: v.totalOrders,
    };
  }

  if (type === 'video') {
    const p = parseVideoRows(rows, brand, reportDate);
    const v = validateVideoRecords(p.records);
    return {
      table: 'video_performance',
      records: p.records,
      matchedColumns: p.matchedColumns,
      missingColumns: p.missingColumns,
      totalCols: p.totalCols,
      errors: v.errors,
      warnings: v.warnings,
      totalGmv: v.totalGmv,
      totalOrders: v.totalOrders,
    };
  }

  if (type === 'videolist') {
    const p = parseVideoListRows(rows, brand);
    return {
      table: 'videos',
      records: p.records,
      matchedColumns: p.matchedColumns,
      missingColumns: p.missingColumns,
      totalCols: p.totalCols,
      errors: [],
      warnings: [],
      totalGmv: p.summary.totalGmv,
      totalOrders: p.summary.totalOrders,
    };
  }

  if (type === 'affiliateproduct') {
    const p = parseProductRows(rows, brand, reportDate);
    const v = validateProductRecords(p.records);
    return {
      table: 'product_performance',
      records: p.records,
      matchedColumns: p.matchedColumns,
      missingColumns: p.missingColumns,
      totalCols: p.totalCols,
      errors: v.errors,
      warnings: v.warnings,
      totalGmv: v.totalGmv,
      totalOrders: v.totalOrders,
    };
  }

  return {
    table: null,
    records: [],
    matchedColumns: [],
    missingColumns: [],
    totalCols: 0,
    errors: [`Unknown file type: ${type}`],
    warnings: [],
    totalGmv: 0,
    totalOrders: 0,
  };
}
