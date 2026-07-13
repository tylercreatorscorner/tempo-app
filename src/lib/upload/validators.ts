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

  // CRITICAL — $0 GMV across ALL rows means the GMV column wasn't matched
  // (TikTok renamed it, or the wrong file was uploaded). That is the ONLY
  // unambiguous mapping-failure signal, so it stays a HARD block.
  if (records.length > 0 && totalGmv === 0) {
    errors.push(
      `🚨 BLOCKED: Total GMV is $0 across all ${records.length} creators. ` +
      `This means the GMV column wasn't found. Expected: "Creator-attributed GMV" ` +
      `(or legacy "Affiliate-attributed GMV"). Verify your file has the correct columns.`
    );
  } else if (records.length > 50) {
    // A high share of $0-GMV creators is NORMAL for a full affiliate-directory
    // export — most registered creators are dormant on any given day. And the
    // fact that SOME creators DID parse non-zero GMV (we're past the totalGmv===0
    // block above) proves the column mapped correctly. So this is a heads-up,
    // NEVER a hard block: the old `zeroPct > 95` block stranded a legitimate
    // ~40k-creator COSRX directory export where 99% were $0 that day. This mirrors
    // the video validator, which only hard-blocks on a real contradiction.
    const zeroPct = (zeroGmvCount / records.length) * 100;
    if (zeroPct > 80) {
      warnings.push(
        `${zeroPct.toFixed(0)}% of creators (${zeroGmvCount}/${records.length}) have $0 GMV — ` +
        `expected for a full creator-directory export. Verify if you meant to upload only active creators.`
      );
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

  // Hard-block $0-GMV uploads on files with non-zero orders. The video table
  // CAN legitimately have $0 some days (no sales) — but if there are orders
  // recorded with $0 GMV, that's always a column-mapping failure, never a
  // legitimate state. We hit this in production: TikTok renamed the GMV
  // column and the old single-name map silently dropped GMV to $0 while
  // orders/items kept mapping correctly.
  if (records.length > 0 && totalGmv === 0 && totalOrders > 0) {
    errors.push(
      `🚨 BLOCKED: Total GMV is $0 across ${records.length} video rows but ${totalOrders.toLocaleString()} orders are present. ` +
      `This means the GMV column wasn't matched. Expected: "Creator Video-attributed GMV" (new) ` +
      `or "Affiliate Video-attributed GMV" (legacy). Verify your file's column names.`
    );
  } else if (records.length > 100 && totalGmv === 0) {
    warnings.push(
      `Total GMV is $0 across ${records.length} videos with no orders either — this might be a slow day, ` +
      `but verify the "Creator Video-attributed GMV" column is present in your file.`
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

  // Hard-block: GMV column not matched. Same check as creator/video — the old
  // upload tool didn't have this guard on product data, which is why product
  // uploads silently landed with $0 GMV for weeks after TikTok renamed the column.
  if (records.length > 0 && totalGmv === 0 && totalOrders > 0) {
    errors.push(
      `🚨 BLOCKED: Total GMV is $0 across ${records.length} product rows but ${totalOrders.toLocaleString()} orders are present. ` +
      `This means the GMV column wasn't matched. Expected: "Creator-attributed GMV" (new) ` +
      `or "Affiliate-attributed GMV" (legacy). Verify your file's column names.`
    );
  }

  return { errors, warnings, totalGmv, totalOrders };
}
