/**
 * Creator spend, pro-rated by delivery.
 *
 * CC pays a retainer against an agreed monthly post count and pro-rates it when
 * a creator delivers short. This computes that:
 *
 *     earned = SUM over retained creators of  retainer x min(delivered / agreed, 1)
 *
 * ⚠️ IT IS AN ESTIMATE, AND THE UI MUST SAY SO. Real payouts run on a
 * spreadsheet outside Tempo, and the invoice figure is CC's management fee plus
 * commission, not creator cost. This is what the delivery data implies was
 * owed, not a record of money that moved.
 *
 * ── The window decides what the number MEANS ────────────────────────────────
 *
 * The agreed post count is MONTHLY. Delivered posts are counted over the report
 * window. That mismatch is why the window has to be classified before the sum
 * means anything, and why there are exactly two readings:
 *
 *   FULL MONTH  → an estimate of what CC owes for the month. Everyone has had
 *                 their whole month to deliver, so a shortfall is a shortfall.
 *
 *   MONTH TO DATE → what posts ALREADY PUBLISHED have earned so far. The same
 *                 arithmetic, and still exact, but it is NOT a spend figure:
 *                 days remain, and creators can still earn the rest. Measured
 *                 on Dr. Dent, August:
 *                     31 days  $25,160    14 days  $13,337
 *                     26 days  $23,460     7 days  $ 8,413
 *                 Same month, same roster, same eventual spend. Present any of
 *                 the short ones as "spent" and it understates badly; present
 *                 them as "earned so far, N of M days elapsed" and each one is
 *                 simply true on the day it was taken.
 *
 *   ANYTHING ELSE → null. A window that does not start on the 1st, or that
 *                 crosses a month boundary, has no honest reading against a
 *                 monthly target at all. The caller renders absence.
 *
 * ⚠️ NEVER PRO-RATE THE TARGET OR THE RETAINER TO THE ELAPSED DAYS. Scaling
 * either one by days/daysInMonth assumes an even posting cadence nobody agreed
 * to, and turns a measurement into an apportionment. Days elapsed is reported
 * as a plain fact beside the figure so the reader can judge it; it never enters
 * the maths. For the same reason nothing here projects a month-end total.
 *
 * ── Two more things that make it wrong if ignored ───────────────────────────
 *
 * 1. ⚠️ CAPPED AT 100% PER CREATOR. Overdelivery does not earn more than the
 *    retainer, so 46 posts against 30 counts as 30. Uncapped, Dr. Dent August
 *    came out $28,847 against $24,800.
 *
 * 2. ⚠️ GATED ON A REAL RETAINER. Affiliate-only creators carry a phantom
 *    monthly_post_requirement (the roster-add route defaults it to 30) while
 *    being paid nothing. Counting them would invent a shortfall against a
 *    target nobody agreed to, for people on no retainer at all.
 *
 * ⚠️ And the denominator is soft: 490 of 555 retained creators sit on the
 * default 30, which is what the add route writes when nobody supplies a figure,
 * NOT a negotiated commitment. Confirmed with the Director 2026-08-31.
 * defaultQuotaShare is returned so the UI can say how much of the figure leans
 * on that default rather than presenting the gap as measured fact.
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

/**
 * How the report window sits against the calendar month the quota is written
 * in. `other` is not a degenerate case to paper over: it is a window the
 * monthly target cannot be read against.
 */
export type SpendWindow =
  | { kind: 'month'; daysInMonth: number }
  | { kind: 'mtd'; daysElapsed: number; daysInMonth: number }
  | { kind: 'other' };

/**
 * Classify a window. It must start on the 1st and stay inside one month: a
 * partial window offset from the month start (say the 10th to the 31st) has no
 * relationship to a monthly count at all.
 */
export function classifySpendWindow(start: Date, end: Date): SpendWindow {
  if (end.getTime() < start.getTime()) return { kind: 'other' };
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth();
  if (!sameMonth || start.getUTCDate() !== 1) return { kind: 'other' };

  const daysInMonth = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const daysElapsed = end.getUTCDate();
  return daysElapsed >= daysInMonth
    ? { kind: 'month', daysInMonth }
    : { kind: 'mtd', daysElapsed, daysInMonth };
}

export interface DeliveredSpend {
  /** Sum of retainers for the creators counted. Never pro-rated. */
  budget: number;
  /**
   * Delivery-weighted, each creator capped at their own retainer. Over a full
   * month this estimates what CC owes; month to date it is what published
   * posts have earned so far, with days still to run.
   */
  earned: number;
  /** 0-100, or null when there is no budget to divide by. */
  pctOfBudget: number | null;
  creators: number;
  /** How many have delivered their full MONTHLY count (or more) already. */
  fullyDelivered: number;
  /**
   * Share of `budget` (0-100) belonging to creators whose agreed post count is
   * the system default rather than a negotiated number. High means the gap
   * between committed and earned is largely measured against an assumption.
   */
  defaultQuotaShare: number | null;
  /**
   * Null over a complete month. Set month to date, and the UI MUST show it:
   * without the day count the same figure reads as a shortfall rather than as
   * progress through a month that is still running.
   */
  partial: { daysElapsed: number; daysInMonth: number } | null;
}

/**
 * Returns null for any window the monthly target cannot be read against, which
 * the caller must render as absence rather than zero.
 */
export function estimateDeliveredSpend(
  creators: DeliveredSpendCreator[],
  window: SpendWindow,
): DeliveredSpend | null {
  if (window.kind === 'other') return null;

  // A real retainer AND a real target. Either missing means there is nothing
  // to pro-rate, not a shortfall.
  const counted = creators.filter(
    (c) => !c.isAffiliate && !c.departed && c.retainer > 0 && (c.quota ?? 0) > 0,
  );
  if (counted.length === 0) return null;

  let budget = 0;
  let earned = 0;
  let defaultQuotaBudget = 0;
  let fullyDelivered = 0;

  for (const c of counted) {
    const quota = c.quota as number;
    budget += c.retainer;
    if (quota === DEFAULT_POST_QUOTA) defaultQuotaBudget += c.retainer;
    // Capped: overdelivery does not pay more than the retainer. The quota is
    // the FULL monthly count even month to date, never scaled to days run.
    const share = Math.min(c.postsPublished / quota, 1);
    earned += c.retainer * share;
    if (c.postsPublished >= quota) fullyDelivered += 1;
  }

  return {
    budget,
    earned,
    pctOfBudget: budget > 0 ? (earned / budget) * 100 : null,
    creators: counted.length,
    fullyDelivered,
    defaultQuotaShare: budget > 0 ? (defaultQuotaBudget / budget) * 100 : null,
    partial:
      window.kind === 'mtd'
        ? { daysElapsed: window.daysElapsed, daysInMonth: window.daysInMonth }
        : null,
  };
}

/**
 * What makes the figure soft, said out loud.
 *
 * Both causes widen the band around the number rather than pushing it one way.
 * A client reading a gap between committed and earned must not read it as
 * money that went unspent.
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
