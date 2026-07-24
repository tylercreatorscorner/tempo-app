/**
 * Client-side shapes for the Earnings cockpit — what GET /api/earnings and
 * GET/POST /api/invoices/run return over the wire. Kept in one module so the
 * table, KPI band, chips, and run modal can't drift on field names.
 */
import type { CompensationModel } from './brand-edit-sheet';

export type InvoiceStatus = 'pending' | 'sent' | 'paid' | 'void';

export interface RowInvoice {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  totalAmount: number;
  dueDate: string | null;
  paidAt: string | null;
}

export interface RowFrozen {
  totalAmount: number;
  frozenAt: string;
  drifted: boolean;
}

export interface BrandRow {
  brand: string;
  brandLabel: string;
  affiliateGmv: number;
  marketingGmv: number;
  totalGmv: number;
  rate: number;
  effectiveRate: number;
  affiliateCommission: number;
  marketingCommission: number;
  commission: number;
  retainer: number;
  configuredRetainer: number;
  productRetainer: number;
  productRetainerName: string | null;
  launchFee: number;
  launchFeeName: string | null;
  launchFeeEnds: string | null;
  totalFees: number;
  total: number;
  monthlyGoal: number;
  marketingCommissionRate: number;
  billToName: string | null;
  billToEmail: string | null;
  billToAddress: string | null;
  paymentInstructions: string | null;
  compensationModel: CompensationModel;
  revshareMaxOutcome: { winner: 'retainer' | 'commission'; activeAmount: number; comparison: number } | null;
  creators: Array<{ name: string; gmv: number; rate: number; commission: number }>;
  /** The (brand, month, payee) invoice — null when none exists yet. */
  invoice: RowInvoice | null;
  /** Ledger freeze written at generation time — null when never invoiced. */
  frozen: RowFrozen | null;
  /** Set on umbrella roll-up rows. */
  umbrella: { storeCount: number } | null;
}

export interface EarningsResponse {
  month: string;
  startDate: string;
  endDate: string;
  brands: BrandRow[];
  totals: {
    affiliateGmv: number;
    marketingGmv: number;
    totalGmv: number;
    commission: number;
    retainers: number;
    launchFees: number;
    earnings: number;
    monthlyGoal: number;
    goalProgressPct: number;
  };
  teamMember: { id: string; name: string } | null;
}

// ── Run plan (GET /api/invoices/run) ─────────────────────────────────

export interface RunPlanReady {
  brand: string;
  brandLabel: string;
  model: CompensationModel;
  total: number;
}
export interface RunPlanInvoiced {
  brand: string;
  brandLabel: string;
  status: string;
  invoiceId: string;
  invoiceNumber: string;
}
export interface RunPlanZero {
  brand: string;
  brandLabel: string;
  total: number;
}
export interface RunPlan {
  month: string;
  teamMemberId: string;
  teamMemberName: string | null;
  ready: RunPlanReady[];
  invoiced: RunPlanInvoiced[];
  zero: RunPlanZero[];
}

/** Per-brand result of POST /api/invoices/run. */
export interface RunResult {
  brand: string;
  ok: boolean;
  invoiceId?: string;
  invoiceNumber?: string;
  error?: string;
  duplicate?: boolean;
}

/**
 * UI-only default-check threshold for the run modal: ready brands below this
 * start UNCHECKED (still checkable). Not enforced server-side.
 */
export const RUN_MINIMUM_USD = 100;

/** Human label for a compensation model, run-modal / Model-column style. */
export function modelLabel(model: CompensationModel): string {
  switch (model) {
    case 'revshare_max': return 'revshare max';
    case 'commission_only': return 'commission only';
    case 'retainer_only': return 'retainer only';
    default: return 'standard';
  }
}

/** "standard · 3%" — the Model column caption. Rate omitted when the model
 *  never pays commission. */
export function modelCaption(model: CompensationModel, ratePct: number): string {
  if (model === 'retainer_only') return modelLabel(model);
  const rate = Number.isInteger(ratePct) ? String(ratePct) : ratePct.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${modelLabel(model)} · ${rate}%`;
}
