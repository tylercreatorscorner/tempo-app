/**
 * Invoice math — the single source of truth for how an invoice's line items
 * and total are computed from an earnings row, and for how a total is
 * RE-computed when line items change.
 *
 * Everything that renders or persists invoice money goes through here:
 *   - POST /api/invoices           → computeInvoiceLineItems (generation)
 *   - POST /api/invoices/[id]/refresh → computeInvoiceLineItems (re-pull)
 *   - PATCH /api/invoices/[id]     → recomputeTotal (line-item edits)
 *   - src/lib/data/earnings.ts     → applyCompensationModel (per-brand calc)
 *   - src/lib/invoices/pdf.tsx     → buildDisplayLineItems (PDF rows)
 *   - share-view.tsx               → buildDisplayLineItems (public page rows)
 *
 * The compensation model controls how retainer + commission combine:
 *   standard        (default) → total = commission + retainer + fees
 *   revshare_max              → MAX(retainer, commission) + fees, loser zeroed
 *   commission_only           → retainer ignored
 *   retainer_only             → commission ignored
 *
 * This module is PURE (no Next/DB imports) so the client-rendered share view
 * can import it. resolveCompensationModel takes the Supabase client and the
 * brand registry as ARGUMENTS for the same reason — importing the server-only
 * client factory here would crash any 'use client' importer.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { expandSlugs, type BrandRegistry } from '@/lib/data/brand-registry-core';

export type CompensationModel = 'standard' | 'revshare_max' | 'commission_only' | 'retainer_only';

const COMPENSATION_MODELS: ReadonlySet<string> = new Set([
  'standard', 'revshare_max', 'commission_only', 'retainer_only',
]);

export function isCompensationModel(v: unknown): v is CompensationModel {
  return typeof v === 'string' && COMPENSATION_MODELS.has(v);
}

/** Which side of MAX(retainer, commission) won under revshare_max, and what
 *  the losing side would have been. Null for every other model. */
export interface RevshareMaxOutcome {
  winner: 'retainer' | 'commission';
  activeAmount: number;
  comparison: number;
}

export interface ModelAdjustedComp {
  commission: number;
  retainer: number;
  revshareMaxOutcome: RevshareMaxOutcome | null;
}

/**
 * Apply the compensation model to a (commission, retainer) pair. Per-creator
 * rate overrides must already be baked into `commission` — the model only
 * controls how commission and retainer COMBINE.
 *
 * Extracted verbatim from the earnings per-brand loop so the earnings page,
 * invoice generation, refresh, and PATCH edits can never drift apart.
 */
export function applyCompensationModel(
  commission: number,
  retainer: number,
  model: CompensationModel,
): ModelAdjustedComp {
  switch (model) {
    case 'revshare_max': {
      // MAX(retainer, commission). Whichever wins, the other goes to 0.
      if (commission >= retainer) {
        return {
          commission,
          retainer: 0,
          revshareMaxOutcome: { winner: 'commission', activeAmount: commission, comparison: retainer },
        };
      }
      return {
        commission: 0,
        retainer,
        revshareMaxOutcome: { winner: 'retainer', activeAmount: retainer, comparison: commission },
      };
    }
    case 'commission_only':
      return { commission, retainer: 0, revshareMaxOutcome: null };
    case 'retainer_only':
      return { commission: 0, retainer, revshareMaxOutcome: null };
    case 'standard':
    default:
      // Both apply additively — no adjustment needed.
      return { commission, retainer, revshareMaxOutcome: null };
  }
}

/** The monetary fields an invoice row persists. */
export interface InvoiceLineItems {
  affiliateGmv: number;
  marketingGmv: number;
  totalGmv: number;
  commission: number;
  retainer: number;
  productRetainer: number;
  launchFee: number;
  totalAmount: number;
}

/** Structural subset of an earnings BrandRow this module needs — declared here
 *  (rather than importing from earnings.ts) so the dependency points ONE way:
 *  earnings.ts imports the model math from this module, never the reverse. */
export interface EarningsBrandLike {
  affiliateGmv: number;
  marketingGmv: number;
  totalGmv: number;
  commission: number;
  retainer: number;
  productRetainer: number;
  launchFee: number;
  compensationModel: CompensationModel;
}

/**
 * Derive an invoice's persisted money fields from an earnings brand row.
 *
 * Earnings rows arrive with the compensation model ALREADY applied per store.
 * Do NOT re-apply it here: an umbrella row merges per-store adjusted values,
 * and under revshare_max one store's commission can win while another's
 * retainer wins — both legitimately non-zero on the merged row. Re-running
 * MAX() on that pair would zero one side and invoice LESS than the earnings
 * page shows (adversarial-review finding). The model belongs to
 * recomputeTotal, which operates on RAW operator edits.
 */
export function computeInvoiceLineItems(row: EarningsBrandLike): InvoiceLineItems {
  return {
    affiliateGmv: row.affiliateGmv,
    marketingGmv: row.marketingGmv,
    totalGmv: row.totalGmv,
    commission: row.commission,
    retainer: row.retainer,
    productRetainer: row.productRetainer,
    launchFee: row.launchFee,
    totalAmount: row.commission + row.retainer + row.productRetainer + row.launchFee,
  };
}

/**
 * Recompute an invoice total from (possibly edited) line items, honoring the
 * brand's compensation model. Replaces the PATCH route's unconditional
 * commission+retainer+fees sum, which over-billed revshare_max / *_only brands
 * whenever a line item was edited.
 */
export function recomputeTotal(
  lineItems: { commission: number; retainer: number; productRetainer: number; launchFee: number },
  model: CompensationModel,
): number {
  const adj = applyCompensationModel(lineItems.commission, lineItems.retainer, model);
  return adj.commission + adj.retainer + lineItems.productRetainer + lineItems.launchFee;
}

/** One renderable invoice line. `affiliateGmv`/`marketingGmv` are set (and
 *  non-zero) only on the commission line, for the GMV sub-caption — the
 *  renderer picks its own currency formatting. */
export interface InvoiceDisplayLineItem {
  key: 'commission' | 'retainer' | 'product_retainer' | 'launch_fee';
  title: string;
  amount: number;
  affiliateGmv?: number;
  marketingGmv?: number;
}

/**
 * Which line items an invoice displays, in canonical order. Shared by the PDF
 * and the public share view so the two can never disagree about which rows
 * exist. Zero-amount lines are dropped (a model-zeroed retainer must not
 * render as "$0.00 Monthly Retainer").
 */
export function buildDisplayLineItems(
  li: Pick<InvoiceLineItems, 'affiliateGmv' | 'marketingGmv' | 'commission' | 'retainer' | 'productRetainer' | 'launchFee'>,
): InvoiceDisplayLineItem[] {
  const items: InvoiceDisplayLineItem[] = [];
  if (li.commission > 0) {
    items.push({
      key: 'commission',
      title: 'Creator Commission',
      amount: li.commission,
      ...(li.affiliateGmv > 0 ? { affiliateGmv: li.affiliateGmv } : {}),
      ...(li.marketingGmv > 0 ? { marketingGmv: li.marketingGmv } : {}),
    });
  }
  if (li.retainer > 0)        items.push({ key: 'retainer', title: 'Monthly Retainer', amount: li.retainer });
  if (li.productRetainer > 0) items.push({ key: 'product_retainer', title: 'Product Retainer', amount: li.productRetainer });
  if (li.launchFee > 0)       items.push({ key: 'launch_fee', title: 'Launch Fee', amount: li.launchFee });
  return items;
}

/**
 * Resolve the compensation model that governs an invoice's (brand, payee)
 * pair, reading `brand_compensation` (keyed per team member, per data store).
 *
 * Umbrella slugs (e.g. 'leefar') expand to their child stores; the first store
 * (registry store_order) with a configured model wins — matching the earnings
 * roll-up, which takes the first store row's model.
 *
 * `teamMemberId` null (legacy invoices predating team_members) falls back to
 * the first non-archived team member, mirroring getEarnings' default payee.
 *
 * THROWS on read failure — a silently-defaulted model recomputes a wrong
 * total, which is the same class of lie as rendering $0 for a failed read.
 */
export async function resolveCompensationModel(
  supabase: SupabaseClient,
  reg: BrandRegistry,
  brandSlug: string,
  teamMemberId: string | null,
): Promise<CompensationModel> {
  let payeeId = teamMemberId;
  if (!payeeId) {
    const { data: tmRow, error: tmErr } = await supabase
      .from('team_members')
      .select('id')
      .eq('is_archived', false)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (tmErr) throw new Error(`[invoice-math] team_members read failed: ${tmErr.message}`);
    payeeId = tmRow?.id ?? null;
    if (!payeeId) return 'standard'; // fresh tenant — nothing configured yet
  }

  const storeSlugs = expandSlugs(reg, brandSlug);
  // Umbrella invoices merge PER-STORE model-adjusted values — picking one
  // child's model to re-apply at the merged grain would mis-zero mixed
  // outcomes (same class as the computeInvoiceLineItems double-apply
  // finding). Merged rows combine additively.
  if (storeSlugs.length > 1) return 'standard';
  const { data, error } = await supabase
    .from('brand_compensation')
    .select('brand, compensation_model')
    .eq('team_member_id', payeeId)
    .in('brand', storeSlugs);
  if (error) throw new Error(`[invoice-math] brand_compensation read failed: ${error.message}`);

  const modelByBrand = new Map<string, unknown>(
    ((data as Array<{ brand: string; compensation_model: string | null }> | null) ?? [])
      .map((r) => [r.brand, r.compensation_model] as const),
  );
  for (const slug of storeSlugs) {
    const m = modelByBrand.get(slug);
    if (isCompensationModel(m)) return m;
  }
  return 'standard';
}
