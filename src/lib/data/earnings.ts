/**
 * Earnings data fetcher.
 *
 * Powers the /earnings page (your monthly commission + retainer + launch fee
 * income, split between Tyler and Matt). Same logic as the old dashboard's
 * Rev Share Calculator, ported with the Toplux MAX(retainer, 5% rev share)
 * special case intact.
 *
 * Inputs:
 *   month  — "YYYY-MM"  (which month to compute earnings for)
 *
 * Pulls from:
 *   creator_performance        — affiliate GMV per (creator, brand) for the month
 *   managed_creators           — to filter to YOUR managed creators only
 *   brand_settings             — per-brand rate, retainer, launch fee, product retainer, monthly goal
 *   creator_commission_rates   — per-(brand, creator) rate overrides
 *   marketing_gmv              — per-(brand, month) manual marketing GMV
 *
 * Per-brand calculation:
 *   affiliateGmv = sum of GMV for managed creators of this brand
 *   marketingGmv = manual entry (editable in UI, persisted to marketing_gmv table)
 *   totalGmv = affiliateGmv + marketingGmv
 *   commission = sum(creatorGmv × creatorRate) + (marketingGmv × 2%)
 *      where creatorRate = commission_rate override (if any) ELSE brand rate
 *      marketing always gets 2% regardless of brand rate
 *   totalFees = retainer + launchFee + productRetainer
 *   total = commission + totalFees   (this is what Tyler+Matt split)
 *
 * Toplux exception:
 *   MAX(retainer, 5% × totalGmv).  If 5% wins, retainer goes to 0 and
 *   commission = 5% × totalGmv. Otherwise normal retainer-only model.
 */
import { createAdminClient } from '@/lib/supabase/server';

export interface BrandRow {
  brand: string;
  brandLabel: string;
  affiliateGmv: number;
  marketingGmv: number;
  totalGmv: number;
  /** Brand commission rate as percentage (e.g. 1.5 for 1.5%) */
  rate: number;
  /** Effective rate after per-creator overrides — only differs when overrides exist */
  effectiveRate: number;
  affiliateCommission: number;
  marketingCommission: number;
  commission: number;
  retainer: number;
  productRetainer: number;
  productRetainerName: string | null;
  launchFee: number;
  launchFeeName: string | null;
  launchFeeEnds: string | null;
  totalFees: number;
  total: number;
  tylerShare: number;
  mattShare: number;
  /** Toplux only: indicates which model is active */
  topluxModel: { type: 'retainer' | 'revshare'; activeAmount: number; comparison: number } | null;
}

export interface EarningsResult {
  month: string;
  startDate: string;
  endDate: string;
  brands: BrandRow[];
  totals: {
    affiliateGmv: number;
    marketingGmv: number;
    totalGmv: number;
    commission: number;
    retainers: number;             // base + product retainers across all brands
    launchFees: number;
    earnings: number;              // commission + retainers + launch fees
    tylerShare: number;
    mattShare: number;
    /** Sum of monthly_gmv_goal across all brands for the goal bar */
    monthlyGoal: number;
    /** % of monthlyGoal achieved this month */
    goalProgressPct: number;
  };
}

interface BrandSettingsRow {
  brand: string;
  /** Decimal multiplier (e.g. 0.02 for 2%) — what we multiply GMV by */
  revenue_share_rate: number | string | null;
  /** Percentage form (e.g. 1.50 for 1.5%) — what the UI shows; used as fallback */
  commission_rate: number | string | null;
  retainer: number | string | null;
  launch_fee: number | string | null;
  launch_fee_name: string | null;
  launch_fee_ends: string | null;
  product_retainer_amount: number | string | null;
  product_retainer_name: string | null;
  monthly_gmv_goal: number | string | null;
}

interface PerfRow {
  creator_name: string;
  brand: string;
  gmv: number | string;
}

function pNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isNaN(n) ? 0 : n;
}

function normalizeHandle(h: string | null | undefined): string {
  if (!h) return '';
  return h.replace(/^@/, '').trim().toLowerCase();
}

/**
 * Umbrella brands that group children (e.g. "LeeFar (All Stores)" =
 * leefar_nutrition + leefar_supplements). These exist in brands_v2 for
 * grouping purposes but never have their own creator_performance rows —
 * uploads land on the child slugs. Excluded from earnings to avoid
 * showing $0 rows that confuse the totals.
 */
const UMBRELLA_BRAND_SLUGS = new Set(['leefar']);

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Resolve the brand's display rate (percentage like 1.5).
 * brand_settings.revenue_share_rate is stored as a decimal (0.02 → 2%)
 * brand_settings.commission_rate is stored as a percentage (1.50)
 * The old calculator used commission_rate. We do the same, with a fallback
 * to revenue_share_rate × 100 if commission_rate is missing.
 */
function getBrandRatePct(s: BrandSettingsRow | undefined): number {
  if (!s) return 2; // fallback default 2%
  const cr = pNum(s.commission_rate);
  if (cr > 0) return cr;
  const rsr = pNum(s.revenue_share_rate);
  if (rsr > 0) return rsr * 100;
  return 2;
}

// ── Main fetcher ───────────────────────────────────────────────────

export async function getEarnings(month: string): Promise<EarningsResult> {
  // Validate month "YYYY-MM"
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error(`Invalid month "${month}" — expected YYYY-MM`);
  }
  const [yearStr, monthStr] = month.split('-');
  const y = Number(yearStr);
  const m = Number(monthStr);
  const startDate = `${yearStr}-${monthStr}-01`;
  const endDate = new Date(Date.UTC(y, m, 0)).toISOString().split('T')[0]; // last day of month

  const supabase = await createAdminClient();

  // ── Resolve the active brand list from brands_v2 (source of truth)
  // Filters out archived brands (e.g. Toplux as of 2026-04-22) and umbrellas
  // (e.g. "leefar" — has no data; its children leefar_nutrition + leefar_supplements
  // do). This replaces the previously-hardcoded list which would silently drift
  // out of sync as brands were added/archived.
  const { data: brandsRaw } = await supabase
    .from('brands_v2')
    .select('slug, name')
    .eq('is_archived', false)
    .order('name');
  const activeBrandRows = (brandsRaw as Array<{ slug: string; name: string }> | null ?? [])
    .filter(b => !UMBRELLA_BRAND_SLUGS.has(b.slug));
  const activeBrandSlugs = activeBrandRows.map(b => b.slug);
  const brandLabelBySlug = new Map(activeBrandRows.map(b => [b.slug, b.name]));

  if (activeBrandSlugs.length === 0) {
    // No active brands — return empty result. Better than throwing on a fresh tenant.
    return {
      month, startDate, endDate, brands: [],
      totals: {
        affiliateGmv: 0, marketingGmv: 0, totalGmv: 0,
        commission: 0, retainers: 0, launchFees: 0,
        earnings: 0, tylerShare: 0, mattShare: 0,
        monthlyGoal: 0, goalProgressPct: 0,
      },
    };
  }

  // ── Fan out: brand settings, perf data, custom rates, marketing GMV, managed creators
  const [
    brandSettingsRes,
    perfRes,
    customRatesRes,
    marketingRes,
    managedRes,
  ] = await Promise.all([
    supabase.from('brand_settings').select('*').in('brand', activeBrandSlugs),
    supabase.from('creator_performance')
      .select('creator_name, brand, gmv')
      .eq('period_type', 'daily')
      .gte('report_date', startDate)
      .lte('report_date', endDate)
      .in('brand', activeBrandSlugs)
      .limit(50000),
    supabase.from('creator_commission_rates').select('creator_name, brand, rate'),
    supabase.from('marketing_gmv').select('brand, amount').eq('month', month),
    supabase.from('managed_creators').select('brand, account_1, account_2, account_3, account_4, account_5'),
  ]);

  const settings = (brandSettingsRes.data as BrandSettingsRow[] | null ?? []);
  const settingsByBrand = new Map(settings.map(s => [s.brand, s]));

  const perfData = (perfRes.data as PerfRow[] | null ?? []);
  const customRates = (customRatesRes.data as Array<{ creator_name: string; brand: string; rate: number | string }> | null ?? []);
  const customRateLookup = new Map<string, number>(); // "handle|||brand" → percentage
  for (const r of customRates) {
    const k = `${normalizeHandle(r.creator_name)}|||${r.brand}`;
    customRateLookup.set(k, pNum(r.rate));
  }

  const marketingByBrand = new Map<string, number>();
  for (const row of (marketingRes.data as Array<{ brand: string; amount: number | string }> | null ?? [])) {
    marketingByBrand.set(row.brand, pNum(row.amount));
  }

  // Build "managed creator" lookup keyed by (handle, brand). Only managed
  // creators count toward affiliate GMV — random affiliates aren't in scope
  // for the rev share calc.
  const managedLookup = new Set<string>();
  for (const m of (managedRes.data as Array<Record<string, string | null>> | null ?? [])) {
    const brand = m.brand;
    if (!brand) continue;
    for (const k of ['account_1','account_2','account_3','account_4','account_5'] as const) {
      const handle = normalizeHandle(m[k]);
      if (handle) managedLookup.add(`${handle}|||${brand}`);
    }
  }

  // ── Aggregate GMV per (brand, creator) — managed creators only
  type CreatorAgg = { handleNorm: string; rawName: string; brand: string; gmv: number };
  const creatorByBrand: Record<string, Map<string, CreatorAgg>> = {};
  const brandAffiliateGmv: Record<string, number> = {};
  const activeBrandSet = new Set(activeBrandSlugs);
  for (const b of activeBrandSlugs) {
    creatorByBrand[b] = new Map();
    brandAffiliateGmv[b] = 0;
  }

  for (const row of perfData) {
    const handle = normalizeHandle(row.creator_name);
    if (!handle) continue;
    if (!activeBrandSet.has(row.brand)) continue;
    const k = `${handle}|||${row.brand}`;
    if (!managedLookup.has(k)) continue;
    const gmv = pNum(row.gmv);
    brandAffiliateGmv[row.brand] += gmv;
    const m = creatorByBrand[row.brand];
    let agg = m.get(handle);
    if (!agg) { agg = { handleNorm: handle, rawName: row.creator_name, brand: row.brand, gmv: 0 }; m.set(handle, agg); }
    agg.gmv += gmv;
  }

  // ── Build per-brand rows
  const brands: BrandRow[] = [];
  let totalAffiliateGmv = 0, totalMarketingGmv = 0, totalGmv = 0;
  let totalCommission = 0, totalRetainers = 0, totalLaunchFees = 0;
  let monthlyGoalSum = 0;

  for (const brand of activeBrandSlugs) {
    const s = settingsByBrand.get(brand);
    const ratePct = getBrandRatePct(s);
    const rateMul = ratePct / 100;
    const affiliateGmv = brandAffiliateGmv[brand];
    const marketingGmv = marketingByBrand.get(brand) ?? 0;
    const gmv = affiliateGmv + marketingGmv;

    // Per-creator commission = sum(creator GMV × creator rate)
    let affiliateCommission = 0;
    for (const c of creatorByBrand[brand].values()) {
      const overrideKey = `${c.handleNorm}|||${brand}`;
      const overridePct = customRateLookup.get(overrideKey);
      const creatorMul = overridePct !== undefined ? overridePct / 100 : rateMul;
      affiliateCommission += c.gmv * creatorMul;
    }
    const marketingCommission = marketingGmv * 0.02; // marketing always at 2%
    let commission = affiliateCommission + marketingCommission;
    const effectiveRate = affiliateGmv > 0 ? (affiliateCommission / affiliateGmv) * 100 : ratePct;

    let retainer = pNum(s?.retainer);
    const productRetainer = pNum(s?.product_retainer_amount);
    const launchFee = pNum(s?.launch_fee);
    let topluxModel: BrandRow['topluxModel'] = null;

    // Toplux exception: MAX(retainer, 5% of total GMV)
    if (brand === 'toplux' && retainer > 0) {
      const topluxRevShare = gmv * 0.05;
      if (topluxRevShare > retainer) {
        commission = topluxRevShare;
        topluxModel = { type: 'revshare', activeAmount: topluxRevShare, comparison: retainer };
        retainer = 0;
      } else {
        commission = 0;
        topluxModel = { type: 'retainer', activeAmount: retainer, comparison: topluxRevShare };
      }
    }

    const totalFees = retainer + productRetainer + launchFee;
    const total = commission + totalFees;
    const tylerShare = total / 2;
    const mattShare = total / 2;

    totalAffiliateGmv += affiliateGmv;
    totalMarketingGmv += marketingGmv;
    totalGmv += gmv;
    totalCommission += commission;
    totalRetainers += retainer + productRetainer;
    totalLaunchFees += launchFee;
    monthlyGoalSum += pNum(s?.monthly_gmv_goal);

    brands.push({
      brand,
      brandLabel: brandLabelBySlug.get(brand) ?? brand,
      affiliateGmv,
      marketingGmv,
      totalGmv: gmv,
      rate: ratePct,
      effectiveRate,
      affiliateCommission,
      marketingCommission,
      commission,
      retainer,
      productRetainer,
      productRetainerName: s?.product_retainer_name ?? null,
      launchFee,
      launchFeeName: s?.launch_fee_name ?? null,
      launchFeeEnds: s?.launch_fee_ends ?? null,
      totalFees,
      total,
      tylerShare,
      mattShare,
      topluxModel,
    });
  }

  const earnings = totalCommission + totalRetainers + totalLaunchFees;

  return {
    month,
    startDate,
    endDate,
    brands,
    totals: {
      affiliateGmv: totalAffiliateGmv,
      marketingGmv: totalMarketingGmv,
      totalGmv,
      commission: totalCommission,
      retainers: totalRetainers,
      launchFees: totalLaunchFees,
      earnings,
      tylerShare: earnings / 2,
      mattShare: earnings / 2,
      monthlyGoal: monthlyGoalSum,
      goalProgressPct: monthlyGoalSum > 0 ? (totalGmv / monthlyGoalSum) * 100 : 0,
    },
  };
}
