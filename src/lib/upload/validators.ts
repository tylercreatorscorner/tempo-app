/**
 * Validation rules for parsed upload records.
 *
 * The most important rule: HARD-BLOCK Creator Data uploads where total GMV
 * is $0 — that's never legitimate, it always means the GMV column wasn't
 * found (TikTok renamed columns or the user uploaded the wrong file). v1.13.0
 * of the old tool was built specifically to prevent silent data corruption
 * from this scenario.
 */
import type {
  CreatorPerformanceRecord,
  ProductPerformanceRecord,
  VideoPerformanceRecord,
} from './parse-rows';

export interface ValidationResult {
  errors: string[];     // Hard blocks — upload cannot proceed
  warnings: string[];   // Surfaced to user but not blocking
  totalGmv: number;
  totalOrders: number;
}

// ── Creator Data ───────────────────────────────────────────────────

export function validateCreatorRecords(records: CreatorPerformanceRecord[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let totalGmv = 0;
  let totalOrders = 0;
  let zeroGmvCount = 0;

  for (const r of records) {
    totalGmv   += r.gmv;
    totalOrders += r.orders;
    if (r.gmv === 0) zeroGmvCount++;

    if (r.gmv > 100_000) warnings.push(`${r.creator_name}: GMV of $${r.gmv.toLocaleString()} unusually high — verify`);
    if (r.gmv < 0)       errors.push(`${r.creator_name}: Negative GMV ($${r.gmv}) not allowed`);
    if (r.orders < 0)    errors.push(`${r.creator_name}: Negative orders not allowed`);
    if (r.gmv > 0 && r.orders === 0) {
      warnings.push(`${r.creator_name}: $${r.gmv.toLocaleString()} GMV but 0 orders`);
    }

    if (r.orders > 0 && r.gmv > 0) {
      const aov = r.gmv / r.orders;
      if (aov < 5)   warnings.push(`${r.creator_name}: AOV of $${aov.toFixed(2)} seems very low`);
      if (aov > 500) warnings.push(`${r.creator_name}: AOV of $${aov.toFixed(2)} unusually high`);
    }
  }

  // CRITICAL — zero GMV across all rows means column mapping failed
  if (records.length > 0 && totalGmv === 0) {
    errors.push(
      `🚨 BLOCKED: Total GMV is $0 across all ${records.length} creators. ` +
      `This means the GMV column wasn't found. Expected: "Creator-attributed GMV" ` +
      `(or legacy "Affiliate-attributed GMV"). Verify your file has the correct columns.`
    );
  } else if (records.length > 50) {
    const zeroPct = (zeroGmvCount / records.length) * 100;
    if (zeroPct > 95) {
      errors.push(
        `🚨 BLOCKED: ${zeroPct.toFixed(0)}% of creators (${zeroGmvCount}/${records.length}) have $0 GMV. ` +
        `This usually indicates a column mapping issue.`
      );
    } else if (zeroPct > 80) {
      warnings.push(`${zeroPct.toFixed(0)}% of creators have $0 GMV — verify this is expected.`);
    }
  }

  return { errors, warnings, totalGmv, totalOrders };
}

// ── Video Data ─────────────────────────────────────────────────────

export function validateVideoRecords(records: VideoPerformanceRecord[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let totalGmv = 0;
  let totalOrders = 0;

  for (const r of records) {
    totalGmv += r.gmv;
    totalOrders += r.orders;

    if (r.gmv > 50_000) warnings.push(`Video ${r.video_id}: GMV of $${r.gmv.toLocaleString()} unusually high for one video`);
    if (r.gmv < 0)      errors.push(`Video ${r.video_id}: Negative GMV ($${r.gmv}) not allowed`);
    if (r.orders < 0)   errors.push(`Video ${r.video_id}: Negative orders not allowed`);

    if (r.video_id && (r.video_id.length < 10 || r.video_id.length > 25)) {
      warnings.push(`Video ${r.video_id}: ID length (${r.video_id.length}) unusual`);
    }
  }

  // Video data CAN legitimately have $0 GMV some days (no sales). Don't hard-block,
  // but surface loudly if a large file returns zero.
  if (totalGmv === 0 && records.length > 100) {
    warnings.push(
      `Total GMV is $0 across ${records.length} videos. This *might* be normal for a slow day, ` +
      `but more often it means the "Affiliate Video-attributed GMV" column wasn't found. Verify.`
    );
  }

  return { errors, warnings, totalGmv, totalOrders };
}

// ── Product Data ───────────────────────────────────────────────────

export function validateProductRecords(records: ProductPerformanceRecord[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let totalGmv = 0;
  let totalOrders = 0;

  for (const r of records) {
    totalGmv += r.gmv;
    totalOrders += r.orders;

    if (r.gmv > 1_000_000) warnings.push(`${r.product_name}: GMV of $${r.gmv.toLocaleString()} unusually high — verify`);
    if (r.gmv < 0)         errors.push(`${r.product_name}: Negative GMV ($${r.gmv}) not allowed`);
    if (r.orders < 0)      errors.push(`${r.product_name}: Negative orders not allowed`);
    if (!r.product_id || r.product_id.length < 5) {
      errors.push(`${r.product_name}: Invalid product ID`);
    }
  }

  return { errors, warnings, totalGmv, totalOrders };
}
