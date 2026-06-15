/**
 * Earnings data fetcher.
 *
 * Powers the /earnings page (monthly commission + retainer + launch fee income).
 *
 * Inputs:
 *   month  — "YYYY-MM"
 *
 * Pulls from:
 *   creator_performance        — affiliate GMV per (creator, brand) for the month
 *   managed_creators           — to filter to managed creators only
 *   brand_settings             — per-brand rate, retainer, launch fee, product retainer, monthly goal,
 *                                compensation_model, marketing_commission_rate
 *   creator_commission_rates   — per-(brand, creator) rate overrides
 *   marketing_gmv              — per-(brand, month) manual marketing GMV
 *   brands_v2                  — active brand list (filters is_archived + is_umbrella)
 *
 * Per-brand calculation:
 *   affiliateGmv     = sum of GMV for managed creators of this brand
 *   marketingGmv     = manual entry (marketing_gmv table)
 *   commission       = sum(creatorGmv × (overrideRate ?? brandRate))
 *                      + (marketingGmv × marketingRate)
 *      where overrideRate is from creator_commission_rates if present
 *
 *   Then compensation_model controls how retainer + commission combine:
 *     standard         (default) → total = commission + retainer + fees
 *     revshare_max               → MAX(retainer, commission), then + fees
 *     commission_only            → retainer ignored
 *     retainer_only              → commission ignored
 *
 *   Per-creator rate overrides apply across all models — the model only
 *   controls how the resulting commission combines with the retainer.
 */
import { createAdminClient } from '@/lib/supabase/server';
import { expandBrandToDataSlugs, LEEFAR_STORE_SLUGS } from '@/lib/utils/constants';

export interface CreatorContribution {
  /** Creator handle as it appears in creator_performance (with @ stripped). */
  name: string;
  /** GMV the creator drove for this brand this month. */
  gmv: number;
  /** Effective rate applied (per-creator override if any, else brand rate). */
  rate: number;
  /** Commission earned on this creator's GMV (gmv × rate / 100). */
  commission: number;
}

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
  /** Configured retainer from brand_settings, before any model adjustment. */
  configuredRetainer: number;
  productRetainer: number;
  productRetainerName: string | null;
  launchFee: number;
  launchFeeName: string | null;
  launchFeeEnds: string | null;
  totalFees: number;
  total: number;
  /** Monthly GMV goal from brand_settings (0 if unset). */
  monthlyGoal: number;
  /** Marketing commission rate as decimal multiplier (0.02 = 2%). */
  marketingCommissionRate: number;
  /** Default invoice recipient name for this brand. */
  billToName: string | null;
  /** Default invoice recipient email for this brand. */
  billToEmail: string | null;
  /** Default invoice recipient address for this brand. */
  billToAddress: string | null;
  /** Default payment instructions text used on invoices for this brand. */
  paymentInstructions: string | null;
  /** Brand's compensation model — how retainer + commission combine. */
  compensationModel: CompensationModel;
  /**
   * Populated when compensationModel = 'revshare_max'. Indicates which side
   * of the MAX(retainer, commission) won and what the loser would have been.
   */
  revshareMaxOutcome: { winner: 'retainer' | 'commission'; activeAmount: number; comparison: number } | null;
  /**
   * Per-creator breakdown of who drove what GMV and the commission earned
   * on each. Sorted by commission descending. Excludes marketing GMV (which
   * isn't attributable to a specific creator).
   */
  creators: CreatorContribution[];
}

export type CompensationModel = 'standard' | 'revshare_max' | 'commission_only' | 'retainer_only';

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
    /** Sum of monthly_gmv_goal across all brands for the goal bar */
    monthlyGoal: number;
    /** % of monthlyGoal achieved this month */
    goalProgressPct: number;
  };
  /** The team member whose compensation arrangements drove this calc.
   *  Null only when no team members exist yet (fresh tenant). */
  teamMember: { id: string; name: string; email: string | null; address: string | null; paymentInstructions: string | null } | null;
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
  compensation_model: CompensationModel | null;
  /** Decimal (e.g. 0.02 = 2%). Default 0.02 if column missing or null. */
  marketing_commission_rate: number | string | null;
  bill_to_name: string | null;
  bill_to_email: string | null;
  bill_to_address: string | null;
  payment_instructions: string | null;
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

/**
 * @param month       YYYY-MM
 * @param teamMemberId  optional — when set, only this member's compensation
 *                    arrangements (retainer, commission rate, etc.) are used.
 *                    When unset, falls back to the first team member found
 *                    (Tyler) so existing behavior is preserved.
 */
/**
 * @param brandFilterSlugs When provided (non-null), restrict the computation
 *   to these brand slugs only — used to scope a manager to their own brands.
 *   null/undefined = all active brands (owner/admin behavior, unchanged).
 */
export async function getEarnings(
  month: string,
  teamMemberId?: string,
  brandFilterSlugs?: string[] | null,
): Promise<EarningsResult> {
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

  // ── Resolve which team member's compensation we're computing.
  // No teamMemberId → default to the first non-archived team member
  // (Tyler in single-tenant ops). Single source of truth for the per-payee
  // financial fields is now `brand_compensation`, keyed by team_member_id.
  let activeTeamMemberId = teamMemberId ?? null;
  if (!activeTeamMemberId) {
    const { data: tmRow } = await supabase
      .from('team_members')
      .select('id')
      .eq('is_archived', false)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    activeTeamMemberId = tmRow?.id ?? null;
  }

  // ── Resolve the active brand list from brands_v2 (source of truth).
  // Excludes archived brands and umbrella groupings (e.g. "leefar" which
  // groups leefar_nutrition + leefar_supplements but has no data of its own).
  const { data: brandsRaw } = await supabase
    .from('brands_v2')
    .select('slug, name')
    .eq('is_archived', false)
    .eq('is_umbrella', false)
    .order('name');
  let activeBrandRows = (brandsRaw as Array<{ slug: string; name: string }> | null ?? []);
  // Manager scoping: restrict to the caller's brands. An empty filter array
  // means "no brands" → empty result (fail-closed), never "all".
  if (brandFilterSlugs != null) {
    const allowed = new Set(brandFilterSlugs);
    activeBrandRows = activeBrandRows.filter(b => allowed.has(b.slug));
  }
  const activeBrandSlugs = activeBrandRows.map(b => b.slug);
  const brandLabelBySlug = new Map(activeBrandRows.map(b => [b.slug, b.name]));

  if (activeBrandSlugs.length === 0) {
    // No active brands — return empty result. Better than throwing on a fresh tenant.
    return {
      month, startDate, endDate, brands: [],
      totals: {
        affiliateGmv: 0, marketingGmv: 0, totalGmv: 0,
        commission: 0, retainers: 0, launchFees: 0,
        earnings: 0,
        monthlyGoal: 0, goalProgressPct: 0,
      },
      teamMember: null,
    };
  }

  // ── Fan out: per-payee compensation, brand-level info, perf data, custom
  // rates, marketing GMV, managed creators, current team member (for payment
  // instructions used by invoice flow).
  const [
    compensationRes,
    brandLevelRes,
    teamMemberRes,
    perfRes,
    customRatesRes,
    marketingRes,
    managedRes,
  ] = await Promise.all([
    activeTeamMemberId
      ? supabase
          .from('brand_compensation')
          .select('brand, retainer, commission_rate, revenue_share_rate, marketing_commission_rate, product_retainer_amount, product_retainer_name, launch_fee, launch_fee_name, launch_fee_ends, compensation_model')
          .eq('team_member_id', activeTeamMemberId)
          .in('brand', activeBrandSlugs)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    // Brand-level fields stay on brand_settings (bill_to_*, monthly_gmv_goal,
    // legacy payment_instructions which we DON'T use anymore now that it lives
    // per-payee on team_members).
    supabase
      .from('brand_settings')
      .select('brand, bill_to_name, bill_to_email, bill_to_address, monthly_gmv_goal')
      .in('brand', activeBrandSlugs),
    // Team member info — for paymentInstructions (per-payee, not per-brand).
    activeTeamMemberId
      ? supabase
          .from('team_members')
          .select('id, name, email, address, payment_instructions')
          .eq('id', activeTeamMemberId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.rpc('get_creator_brand_gmv', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_brands: activeBrandSlugs,
    }),
    supabase.from('creator_commission_rates').select('creator_name, brand, rate'),
    supabase.from('marketing_gmv').select('brand, amount').eq('month', month),
    supabase.from('managed_creators')
      .select('brand, creator_id, account_1, account_2, account_3, account_4, account_5')
      .is('archived_at', null),
  ]);

  // Merge per-payee compensation rows with brand-level info into a single
  // BrandSettingsRow-shaped lookup. The downstream loop is unchanged.
  const compensationRows = (compensationRes.data as Array<Record<string, unknown>> | null ?? []);
  const brandLevelRows = (brandLevelRes.data as Array<Record<string, unknown>> | null ?? []);
  const teamMember = (teamMemberRes.data as { name?: string; email?: string; address?: string; payment_instructions?: string | null } | null);

  const compByBrand = new Map<string, Record<string, unknown>>();
  for (const r of compensationRows) compByBrand.set(String(r.brand), r);
  const brandLevelByBrand = new Map<string, Record<string, unknown>>();
  for (const r of brandLevelRows) brandLevelByBrand.set(String(r.brand), r);

  const settingsByBrand = new Map<string, BrandSettingsRow>();
  for (const slug of activeBrandSlugs) {
    const c = compByBrand.get(slug);
    const b = brandLevelByBrand.get(slug);
    if (!c && !b) continue;
    settingsByBrand.set(slug, {
      brand: slug,
      revenue_share_rate:        c?.revenue_share_rate as number | string | null ?? null,
      commission_rate:           c?.commission_rate as number | string | null ?? null,
      retainer:                  c?.retainer as number | string | null ?? null,
      launch_fee:                c?.launch_fee as number | string | null ?? null,
      launch_fee_name:           (c?.launch_fee_name as string | null) ?? null,
      launch_fee_ends:           (c?.launch_fee_ends as string | null) ?? null,
      product_retainer_amount:   c?.product_retainer_amount as number | string | null ?? null,
      product_retainer_name:     (c?.product_retainer_name as string | null) ?? null,
      monthly_gmv_goal:          b?.monthly_gmv_goal as number | string | null ?? null,
      compensation_model:        (c?.compensation_model as CompensationModel | null) ?? null,
      marketing_commission_rate: c?.marketing_commission_rate as number | string | null ?? null,
      bill_to_name:              (b?.bill_to_name as string | null) ?? null,
      bill_to_email:             (b?.bill_to_email as string | null) ?? null,
      bill_to_address:           (b?.bill_to_address as string | null) ?? null,
      // Payment instructions now live on the team member, not the brand.
      payment_instructions:      teamMember?.payment_instructions ?? null,
    });
  }

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
  //
  // Handles come from tiktok_accounts (canonical, unlimited per creator),
  // matching how the /roster ("My Creators") page resolves them. The legacy
  // account_1..5 columns are only a fallback for rows lacking a creator_id
  // link — reading just those five under-counted GMV for creators with more
  // than five handles (or whose handles live only in tiktok_accounts).
  //
  // Umbrella brands (e.g. 'leefar') get expanded to their store slugs
  // (leefar_nutrition, leefar_supplements) so the lookup matches
  // creator_performance rows, which are keyed by store. A creator under the
  // LeeFar umbrella counts toward both stores' rev share — exactly the
  // intended model: one roster row, two stores' worth of GMV.
  const managedRows = (managedRes.data as Array<{
    brand: string | null;
    creator_id: string | null;
    account_1: string | null; account_2: string | null; account_3: string | null;
    account_4: string | null; account_5: string | null;
  }> | null ?? []);

  // Resolve canonical handles per creator_id from tiktok_accounts (one query).
  const managedCreatorIds = Array.from(new Set(
    managedRows.map(m => m.creator_id).filter((v): v is string => !!v),
  ));
  const handlesByCreatorId = new Map<string, string[]>();
  if (managedCreatorIds.length > 0) {
    const { data: taRows } = await supabase
      .from('tiktok_accounts')
      .select('creator_id, tiktok_username')
      .in('creator_id', managedCreatorIds);
    for (const r of (taRows as Array<{ creator_id: string; tiktok_username: string | null }> | null ?? [])) {
      const handle = normalizeHandle(r.tiktok_username);
      if (!handle) continue;
      const list = handlesByCreatorId.get(r.creator_id) ?? [];
      list.push(handle);
      handlesByCreatorId.set(r.creator_id, list);
    }
  }

  const managedLookup = new Set<string>();
  for (const m of managedRows) {
    const brand = m.brand;
    if (!brand) continue;
    const dataBrands = expandBrandToDataSlugs(brand);
    // Prefer canonical tiktok_accounts handles; fall back to the legacy
    // columns only when this row has no creator_id link / no accounts rows.
    const fromAccounts = m.creator_id ? handlesByCreatorId.get(m.creator_id) : undefined;
    const handles = (fromAccounts && fromAccounts.length > 0)
      ? fromAccounts
      : [m.account_1, m.account_2, m.account_3, m.account_4, m.account_5]
          .map(normalizeHandle)
          .filter(Boolean);
    for (const handle of handles) {
      for (const dataBrand of dataBrands) {
        managedLookup.add(`${handle}|||${dataBrand}`);
      }
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
    // Honor an explicitly configured marketing rate — INCLUDING 0% (a brand
    // that pays no marketing commission). Only fall back to the 2% default when
    // the brand has no rate set at all (null/blank). The old `pNum(...) || 0.02`
    // treated a real 0 as "unset" and silently charged 2% — so the rate the UI
    // showed didn't match the commission that was actually computed.
    const rawMarketingRate = s?.marketing_commission_rate;
    const marketingMul =
      rawMarketingRate === null || rawMarketingRate === undefined || rawMarketingRate === ''
        ? 0.02
        : pNum(rawMarketingRate);
    const affiliateGmv = brandAffiliateGmv[brand];
    const marketingGmv = marketingByBrand.get(brand) ?? 0;
    const gmv = affiliateGmv + marketingGmv;

    // Affiliate commission = sum(creator GMV × creator rate). Per-creator
    // overrides (creator_commission_rates) win over the brand rate; this
    // applies regardless of compensation_model.
    let affiliateCommission = 0;
    const creators: CreatorContribution[] = [];
    for (const c of creatorByBrand[brand].values()) {
      const overrideKey = `${c.handleNorm}|||${brand}`;
      const overridePct = customRateLookup.get(overrideKey);
      const creatorPct = overridePct !== undefined ? overridePct : ratePct;
      const creatorMul = creatorPct / 100;
      const creatorCommission = c.gmv * creatorMul;
      affiliateCommission += creatorCommission;
      creators.push({
        name: c.rawName,
        gmv: c.gmv,
        rate: creatorPct,
        commission: creatorCommission,
      });
    }
    creators.sort((a, b) => b.commission - a.commission);
    const marketingCommission = marketingGmv * marketingMul;
    let commission = affiliateCommission + marketingCommission;
    const effectiveRate = affiliateGmv > 0 ? (affiliateCommission / affiliateGmv) * 100 : ratePct;

    const configuredRetainer = pNum(s?.retainer);
    let retainer = configuredRetainer;
    const productRetainer = pNum(s?.product_retainer_amount);
    const launchFee = pNum(s?.launch_fee);
    const monthlyGoal = pNum(s?.monthly_gmv_goal);
    const compensationModel: CompensationModel = s?.compensation_model ?? 'standard';
    let revshareMaxOutcome: BrandRow['revshareMaxOutcome'] = null;

    // Apply compensation model. Per-creator overrides have already been
    // baked into `commission` above — the model only controls how
    // `commission` and `retainer` combine.
    switch (compensationModel) {
      case 'revshare_max': {
        // MAX(retainer, commission). Whichever wins, the other goes to 0.
        if (commission >= retainer) {
          revshareMaxOutcome = { winner: 'commission', activeAmount: commission, comparison: retainer };
          retainer = 0;
        } else {
          revshareMaxOutcome = { winner: 'retainer', activeAmount: retainer, comparison: commission };
          commission = 0;
        }
        break;
      }
      case 'commission_only':
        retainer = 0;
        break;
      case 'retainer_only':
        commission = 0;
        break;
      case 'standard':
      default:
        // Both apply additively — no adjustment needed.
        break;
    }

    const totalFees = retainer + productRetainer + launchFee;
    const total = commission + totalFees;

    // If commission ends up at $0 (model zeroed it, or rate is 0%), the
    // per-creator breakdown is meaningless / misleading — drop it so the
    // PDF section stops rendering. The earnings page can still show GMV
    // and total separately.
    if (commission === 0 && creators.length > 0) {
      creators.length = 0;
    }

    totalAffiliateGmv += affiliateGmv;
    totalMarketingGmv += marketingGmv;
    totalGmv += gmv;
    totalCommission += commission;
    totalRetainers += retainer + productRetainer;
    totalLaunchFees += launchFee;
    monthlyGoalSum += monthlyGoal;

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
      configuredRetainer,
      productRetainer,
      productRetainerName: s?.product_retainer_name ?? null,
      launchFee,
      launchFeeName: s?.launch_fee_name ?? null,
      launchFeeEnds: s?.launch_fee_ends ?? null,
      totalFees,
      total,
      monthlyGoal,
      marketingCommissionRate: marketingMul,
      billToName: s?.bill_to_name ?? null,
      billToEmail: s?.bill_to_email ?? null,
      billToAddress: s?.bill_to_address ?? null,
      paymentInstructions: s?.payment_instructions ?? null,
      compensationModel,
      revshareMaxOutcome,
      creators,
    });
  }

  // ── Roll up LeeFar's two stores into a single 'leefar' umbrella row.
  // brand_settings is still keyed per-store (one might have the retainer,
  // both share the rate). We sum the financials and merge creators by handle
  // so the page shows ONE LeeFar entry — but per-store GMV is still tracked
  // upstream for any drill-in views that want it.
  const leefarStoreBrands: BrandRow[] = [];
  const otherBrands: BrandRow[] = [];
  for (const b of brands) {
    if ((LEEFAR_STORE_SLUGS as readonly string[]).includes(b.brand)) {
      leefarStoreBrands.push(b);
    } else {
      otherBrands.push(b);
    }
  }

  const finalBrands: BrandRow[] = otherBrands;
  if (leefarStoreBrands.length > 0) {
    // Merge creator contributions across both stores by normalized handle —
    // same creator posting on both stores shouldn't appear twice.
    const mergedCreators = new Map<string, CreatorContribution>();
    for (const b of leefarStoreBrands) {
      for (const c of b.creators) {
        const key = normalizeHandle(c.name);
        const existing = mergedCreators.get(key);
        if (existing) {
          existing.gmv += c.gmv;
          existing.commission += c.commission;
          // Use whichever rate is higher (override if any). Equal in practice
          // because both stores share the brand rate.
          if (c.rate > existing.rate) existing.rate = c.rate;
        } else {
          mergedCreators.set(key, { ...c });
        }
      }
    }

    // Pick the first non-zero settings field as the umbrella's value
    // (retainer, launchFee, productRetainer typically live on one store).
    const pickFirstNonZero = (...vals: number[]) => vals.find(v => v > 0) ?? 0;
    const pickFirstString = (...vals: Array<string | null>) => vals.find(v => v != null) ?? null;

    const sumNum = (key: keyof BrandRow) =>
      leefarStoreBrands.reduce((acc, b) => acc + (Number(b[key]) || 0), 0);

    const first = leefarStoreBrands[0];
    const merged: BrandRow = {
      brand: 'leefar',
      brandLabel: 'LeeFar',
      affiliateGmv: sumNum('affiliateGmv'),
      marketingGmv: sumNum('marketingGmv'),
      totalGmv: sumNum('totalGmv'),
      rate: first.rate,
      effectiveRate: (() => {
        const totalAff = sumNum('affiliateGmv');
        const totalAffComm = sumNum('affiliateCommission');
        return totalAff > 0 ? (totalAffComm / totalAff) * 100 : first.rate;
      })(),
      affiliateCommission: sumNum('affiliateCommission'),
      marketingCommission: sumNum('marketingCommission'),
      commission: sumNum('commission'),
      retainer: sumNum('retainer'),
      configuredRetainer: sumNum('configuredRetainer'),
      productRetainer: sumNum('productRetainer'),
      productRetainerName: pickFirstString(...leefarStoreBrands.map(b => b.productRetainerName)),
      launchFee: sumNum('launchFee'),
      launchFeeName: pickFirstString(...leefarStoreBrands.map(b => b.launchFeeName)),
      launchFeeEnds: pickFirstString(...leefarStoreBrands.map(b => b.launchFeeEnds)),
      totalFees: sumNum('totalFees'),
      total: sumNum('total'),
      monthlyGoal: sumNum('monthlyGoal'),
      marketingCommissionRate: first.marketingCommissionRate,
      billToName: pickFirstString(...leefarStoreBrands.map(b => b.billToName)),
      billToEmail: pickFirstString(...leefarStoreBrands.map(b => b.billToEmail)),
      billToAddress: pickFirstString(...leefarStoreBrands.map(b => b.billToAddress)),
      paymentInstructions: pickFirstString(...leefarStoreBrands.map(b => b.paymentInstructions)),
      compensationModel: first.compensationModel,
      revshareMaxOutcome: null, // not meaningful when summing across two stores
      creators: Array.from(mergedCreators.values()).sort((a, b) => b.commission - a.commission),
    };
    void pickFirstNonZero; // currently unused; kept for future per-field pickers
    finalBrands.push(merged);
  }

  // Sort: keep stable by total earnings desc (matches what the UI expects)
  finalBrands.sort((a, b) => b.total - a.total);

  const earnings = totalCommission + totalRetainers + totalLaunchFees;

  // Resolve teamMember snapshot — same data used downstream by invoices.
  let resolvedTeamMember: EarningsResult['teamMember'] = null;
  if (teamMember && activeTeamMemberId) {
    resolvedTeamMember = {
      id: activeTeamMemberId,
      name: teamMember.name ?? '',
      email: teamMember.email ?? null,
      address: teamMember.address ?? null,
      paymentInstructions: teamMember.payment_instructions ?? null,
    };
  }

  return {
    month,
    startDate,
    endDate,
    brands: finalBrands,
    teamMember: resolvedTeamMember,
    totals: {
      affiliateGmv: totalAffiliateGmv,
      marketingGmv: totalMarketingGmv,
      totalGmv,
      commission: totalCommission,
      retainers: totalRetainers,
      launchFees: totalLaunchFees,
      earnings,
      monthlyGoal: monthlyGoalSum,
      goalProgressPct: monthlyGoalSum > 0 ? (totalGmv / monthlyGoalSum) * 100 : 0,
    },
  };
}
