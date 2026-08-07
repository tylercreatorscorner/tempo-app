/**
 * Cost-vs-return for the brand portal — what a brand paid us in a month, and
 * what their managed roster produced against it.
 *
 * Brands asked for this directly: the portal's existing ROI compares roster GMV
 * to RETAINER only, which flatters us. This reads the invoice instead, so the
 * comparison includes rev-share commission, product retainers and launch fees.
 *
 * ── Why this is month-grain, and cannot be anything else ────────────────────
 *
 * Retainers and fees are billed monthly. There is no daily or weekly grain to
 * read. Slicing a monthly retainer across a 7-day window would be apportioning,
 * i.e. an estimate, so this deliberately ignores the page's period selector and
 * reports whole closed months only.
 *
 * ── The two aggregation rules, both load-bearing ────────────────────────────
 *
 * A brand-month is frequently SEVERAL invoices, one per team member. Measured
 * on prod 2026-08-06: lemme, catakor, jiyu and leefar all split June across two
 * or three.
 *
 *   COST is additive.  SUM(total_amount) across the rows. Reading a single row
 *                      understates badly: lemme June is $5,990.46 + $330.15,
 *                      and picking the smaller one alone would claim they spent
 *                      $330 and got 200x back.
 *
 *   GMV is NOT additive. Every invoice in a month carries the same brand-wide
 *                      GMV figure, so summing double-counts it. jiyu June is
 *                      $265,028 real against $524,523 if summed. Take MAX: when
 *                      the rows disagree slightly (different snapshot times)
 *                      the largest is the most complete, and it is a selection
 *                      from real values rather than a derived number.
 *
 * ── Scope safety ────────────────────────────────────────────────────────────
 *
 * `invoices` has RLS enabled with ZERO policies, which is deny-all, so this is
 * only reachable through the service-role client and scoping is entirely this
 * code's responsibility. Callers MUST pass ctx.activeBrand.slug, which
 * loadBrandPortalContext derives from user_brand_access and validates the
 * active-brand cookie against. Never pass a slug taken from a query parameter.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface BrandBillingMonth {
  /** First day of the month, ISO date. */
  month: string;
  /** "June 2026" */
  monthLabel: string;
  retainer: number;
  commission: number;
  productRetainer: number;
  launchFee: number;
  /** SUM of total_amount across every invoice in the month. */
  total: number;
  /** MAX of total_gmv — see the header. */
  gmv: number;
  /**
   * GMV per $1 of fees. Null when total is 0, because dividing by it would
   * render as infinite return on a client-facing screen.
   */
  gmvPerDollar: number | null;
  /** How many invoices were summed. Surfaced so the page can say so. */
  invoiceCount: number;
  /** True when the invoices in this month disagreed on total_gmv. */
  gmvAmbiguous: boolean;
  /**
   * Whole months between this invoice month and the current one.
   *
   * Not decoration. physicians_choice's most recent invoice is 2026-01, so in
   * August the panel would otherwise present a seven-month-old figure as
   * "last closed month" and the client would reasonably read it as current.
   * The page says so out loud past a threshold rather than quietly showing an
   * old number.
   */
  monthsStale: number;
}

interface InvoiceRow {
  period_month: string;
  total_gmv: number | string | null;
  total_amount: number | string | null;
  retainer: number | string | null;
  commission: number | string | null;
  product_retainer: number | string | null;
  launch_fee: number | string | null;
}

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;

function labelFor(monthIso: string): string {
  const [y, m] = monthIso.split('-');
  const name = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ][Number(m) - 1];
  return name ? `${name} ${y}` : monthIso;
}

/**
 * The most recent month that has any invoice for this brand.
 *
 * Returns null when the brand has never been invoiced, which the page renders
 * as an em dash. It must never render as $0: a zero cost reads as "free" and
 * makes the return ratio infinite.
 *
 * NOTE on umbrella brands: invoices are written at the umbrella slug (e.g.
 * `leefar`), not per store. A store-scoped portal user therefore gets null here
 * rather than their parent's bill, which would overstate one store's cost by
 * the whole group's. That is the honest gap; do not "fix" it by falling back to
 * the parent.
 */
export async function getBrandBillingMonth(
  admin: SupabaseClient,
  brandSlug: string,
): Promise<BrandBillingMonth | null> {
  const { data, error } = await admin
    .from('invoices')
    .select(
      'period_month, total_gmv, total_amount, retainer, commission, product_retainer, launch_fee',
    )
    .eq('brand', brandSlug)
    .order('period_month', { ascending: false });

  // A failed read is not a zero bill. Surface it rather than letting the page
  // imply the brand was billed nothing.
  if (error) throw new Error(`invoices read failed for ${brandSlug}: ${error.message}`);

  const rows = (data ?? []) as InvoiceRow[];
  if (rows.length === 0) return null;

  const latest = rows[0].period_month;
  const inMonth = rows.filter((r) => r.period_month === latest);

  const total = inMonth.reduce((a, r) => a + num(r.total_amount), 0);
  const gmvValues = inMonth.map((r) => num(r.total_gmv));
  const gmv = Math.max(...gmvValues);

  return {
    month: latest,
    monthLabel: labelFor(latest),
    retainer: inMonth.reduce((a, r) => a + num(r.retainer), 0),
    commission: inMonth.reduce((a, r) => a + num(r.commission), 0),
    productRetainer: inMonth.reduce((a, r) => a + num(r.product_retainer), 0),
    launchFee: inMonth.reduce((a, r) => a + num(r.launch_fee), 0),
    total,
    gmv,
    gmvPerDollar: total > 0 ? gmv / total : null,
    invoiceCount: inMonth.length,
    gmvAmbiguous: new Set(gmvValues).size > 1,
    monthsStale: monthsBetween(latest, new Date()),
  };
}

/** Whole months from a `YYYY-MM` string to `now`. Negative clamps to 0. */
function monthsBetween(monthIso: string, now: Date): number {
  const [y, m] = monthIso.split('-').map(Number);
  if (!y || !m) return 0;
  const diff = (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - m);
  return Math.max(0, diff);
}
