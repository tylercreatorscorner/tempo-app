/**
 * Estimated creator spend, pro-rated by delivery.
 *
 * CC pays a retainer against an agreed monthly post count and pro-rates it when
 * a creator delivers short. This computes that:
 *
 *     spend = SUM over retained creators of  retainer x min(delivered / agreed, 1)
 *
 * ⚠️ IT IS AN ESTIMATE, AND THE UI MUST SAY SO. Real payouts run on a
 * spreadsheet outside Tempo, and the invoice figure is CC's management fee plus
 * commission, not creator cost. This is what the delivery data implies was
 * owed, not a record of money that moved.
 *
 * ── Three things that make it wrong if ignored ──────────────────────────────
 *
 * 1. ⚠️ ONLY VALID OVER A FULL CALENDAR MONTH. The agreed post count is
 *    MONTHLY; delivered posts are counted over the report window. Measure a
 *    part-month against a monthly target and every creator reads short, so the
 *    estimate collapses. Measured on Dr. Dent, August:
 *        full month  $25,160 (46.8% of budget)
 *        26 days     $23,460 (43.6%)
 *        14 days     $13,337 (24.8%)
 *        7  days     $ 8,413 (15.7%)
 *    Same month, same roster, same real spend. The error is always in the same
 *    direction: it UNDERSTATES what CC paid. So this returns null for anything
 *    that is not a whole calendar month, and the caller renders absence.
 *
 * 2. ⚠️ CAPPED AT 100% PER CREATOR. Overdelivery does not earn more than the
 *    retainer, so 46 posts against 30 counts as 30. Uncapped, Dr. Dent August
 *    came out $20,530 against $17,110 on the same inputs.
 *
 * 3. ⚠️ GATED ON A REAL RETAINER. Affiliate-only creators carry a phantom
 *    monthly_post_requirement (the roster-add route defaults it to 30) while
 *    being paid nothing. Counting them would invent a shortfall against a
 *    target nobody agreed to, for people on no retainer at all.
 *
 * ⚠️ And the denominator is soft: 490 of 555 retained creators sit on the
 * default 30, which is what the add route writes when nobody supplies a figure,
 * NOT a negotiated commitment. Confirmed with the Director 2026-08-31.
 * defaultQuotaShare is returned so the UI can say how much of the estimate
 * leans on that default rather than presenting the gap as measured fact.
 */

/** What /api/roster writes when no post requirement is supplied. */
export const DEFAULT_POST_QUOTA = 30;

export interface DeliveredSpendCreator {
  isAffiliate: boolean;
  departed?: boolean;
  retainer: number;
  quota: number | null;
  postsPublished: number;
}

export interface DeliveredSpend {
  /** Sum of retainers for the creators counted. */
  budget: number;
  /** Delivery-weighted spend, each creator capped at their own retainer. */
  estimated: number;
  /** 0-100, or null when there is no budget to divide by. */
  pctOfBudget: number | null;
  creators: number;
  /** How many delivered their full agreed count (or more). */
  fullyDelivered: number;
  /**
   * Share of `budget` (0-100) belonging to creators whose agreed post count is
   * the system default rather than a negotiated number. High means the gap
   * between budget and estimate is largely measured against an assumption.
   */
  defaultQuotaShare: number | null;
}

/**
 * Returns null when the window is not a whole calendar month, which the caller
 * must render as absence rather than zero. See note 1 above.
 */
export function estimateDeliveredSpend(
  creators: DeliveredSpendCreator[],
  wholeMonth: boolean,
): DeliveredSpend | null {
  if (!wholeMonth) return null;

  // A real retainer AND a real target. Either missing means there is nothing
  // to pro-rate, not a shortfall.
  const counted = creators.filter(
    (c) => !c.isAffiliate && !c.departed && c.retainer > 0 && (c.quota ?? 0) > 0,
  );
  if (counted.length === 0) return null;

  let budget = 0;
  let estimated = 0;
  let defaultQuotaBudget = 0;
  let fullyDelivered = 0;

  for (const c of counted) {
    const quota = c.quota as number;
    budget += c.retainer;
    if (quota === DEFAULT_POST_QUOTA) defaultQuotaBudget += c.retainer;
    // Capped: overdelivery does not pay more than the retainer.
    const share = Math.min(c.postsPublished / quota, 1);
    estimated += c.retainer * share;
    if (c.postsPublished >= quota) fullyDelivered += 1;
  }

  return {
    budget,
    estimated,
    pctOfBudget: budget > 0 ? (estimated / budget) * 100 : null,
    creators: counted.length,
    fullyDelivered,
    defaultQuotaShare: budget > 0 ? (defaultQuotaBudget / budget) * 100 : null,
  };
}

/**
 * What makes the delivered-spend estimate soft, said out loud.
 *
 * Both causes understate nothing and overstate nothing on their own; they
 * widen the band around the figure. A client reading a gap between committed
 * and estimated must not read it as money that went unspent.
 */
export function spendCaveats(defaultQuotaShare: number | null, retainerExact: boolean): string[] {
  const out: string[] = [];
  if (defaultQuotaShare !== null && defaultQuotaShare >= 40) {
    out.push(
      `${defaultQuotaShare.toFixed(0)}% of the committed figure sits against a standard 30-post ` +
        'target rather than an individually negotiated one',
    );
  }
  if (!retainerExact) {
    out.push('retainers are the current agreement carried back over this period, not a dated record');
  }
  return out;
}

