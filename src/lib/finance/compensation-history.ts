import type { SupabaseClient } from '@supabase/supabase-js';

export interface CompensationFinancials {
  retainer: number | string | null;
  product_retainer_amount: number | string | null;
  product_retainer_name: string | null;
  launch_fee: number | string | null;
  launch_fee_name: string | null;
  launch_fee_ends: string | null;
  commission_rate: number | string | null;
  revenue_share_rate: number | string | null;
  marketing_commission_rate: number | string | null;
  compensation_model: 'standard' | 'revshare_max' | 'commission_only' | 'retainer_only' | null;
}

export interface CompensationHistoryRow extends CompensationFinancials {
  brand: string;
  active: boolean;
  /** Latest revision of the pair, suitable for optimistic writes. */
  revision: number;
  snapshot_revision: number;
  /** NULL denotes an observed legacy baseline with no asserted start date. */
  effective_month: string | null;
  team_member_id?: string;
}

export type CompensationPatch = Partial<CompensationFinancials>;
export interface CompensationChange {
  brand: string;
  teamMemberId: string;
  patch: CompensationPatch;
  active?: boolean;
  expectedRevision?: number;
}
export interface CompensationWriteInput extends CompensationChange {
  tenantId: string;
  actorId: string;
  effectiveMonth: string;
  source?: Record<string, unknown>;
}

function assertMonth(month: string) {
  if (!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid compensation month.');
}

function parseRows(data: unknown): CompensationHistoryRow[] {
  if (!Array.isArray(data) || data.some(row => !row || typeof row !== 'object' || typeof row.brand !== 'string' || typeof row.active !== 'boolean' || !Number.isInteger(row.revision))) {
    throw new Error('Compensation history returned an incomplete response.');
  }
  return data as CompensationHistoryRow[];
}

export async function readCompensationForMonth(db: SupabaseClient, tenantId: string, payeeId: string, brandSlugs: string[], month: string): Promise<CompensationHistoryRow[]> {
  assertMonth(month);
  if (!tenantId || !payeeId) throw new Error('Financial scope is required.');
  if (!brandSlugs.length) return [];
  const brands = [...new Set(brandSlugs)];
  const { data, error } = await db.rpc('finance_compensation_for_month', { p_tenant_id: tenantId, p_team_member_id: payeeId, p_brands: brands, p_month: month });
  if (error) throw new Error(`Compensation history could not be loaded: ${error.message}`);
  const rows = parseRows(data);
  if (rows.length !== brands.length || new Set(rows.map(row => row.brand)).size !== brands.length || rows.some(row => !brands.includes(row.brand))) throw new Error('Compensation history returned an incomplete response.');
  return rows;
}

export async function writeCompensationForMonth(db: SupabaseClient, input: CompensationWriteInput): Promise<CompensationHistoryRow> {
  assertMonth(input.effectiveMonth);
  const { data, error } = await db.rpc('finance_compensation_write', {
    p_tenant_id: input.tenantId, p_actor_id: input.actorId, p_brand: input.brand, p_team_member_id: input.teamMemberId,
    p_effective_month: input.effectiveMonth, p_patch: input.patch, p_active: input.active ?? true,
    p_expected_revision: input.expectedRevision ?? null, p_source: input.source ?? {},
  });
  if (error) throw new Error(`Compensation could not be saved: ${error.message}`);
  return parseRows([data])[0];
}

export async function writeCompensationBatchForMonth(db: SupabaseClient, input: { tenantId: string; actorId: string; effectiveMonth: string; rows: CompensationChange[]; source?: Record<string, unknown> }): Promise<CompensationHistoryRow[]> {
  assertMonth(input.effectiveMonth);
  if (!input.rows.length) return [];
  const { data, error } = await db.rpc('finance_compensation_write_batch', {
    p_tenant_id: input.tenantId, p_actor_id: input.actorId, p_effective_month: input.effectiveMonth,
    p_changes: input.rows.map(row => ({ brand: row.brand, team_member_id: row.teamMemberId, patch: row.patch, active: row.active ?? true, expected_revision: row.expectedRevision ?? null })),
    p_source: input.source ?? {},
  });
  if (error) throw new Error(`Compensation could not be saved: ${error.message}`);
  const rows = parseRows(data);
  if (rows.length !== input.rows.length) throw new Error('Compensation history returned an incomplete response.');
  return rows;
}
