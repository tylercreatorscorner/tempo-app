/**
 * Earnings-freeze ledger writes (earnings_ledger, migration 105).
 *
 * One row per (brand, month, payee): the full earnings BrandRow that produced
 * an invoice, frozen at generation time and re-frozen on refresh. Phase 2
 * reads this so invoiced months render from the FROZEN snapshot instead of a
 * live recompute — late data uploads stop silently rewriting history. This
 * phase only WRITES it; nothing displays it yet.
 *
 * The table is service-role only (RLS enabled, zero policies) — callers must
 * pass an ADMIN client.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BrandRow } from '@/lib/data/earnings';

export interface EarningsLedgerWrite {
  brandSlug: string;
  /** YYYY-MM */
  periodMonth: string;
  teamMemberId: string;
  /** The full earnings row the invoice was generated from. */
  snapshot: BrandRow;
  invoiceId: string | null;
}

/**
 * Upsert the freeze row. Returns an error message (already logged) instead of
 * throwing: by the time this runs the invoice insert/update has ALREADY
 * succeeded, so failing the request would misreport a completed operation —
 * callers surface the returned warning instead.
 */
export async function upsertEarningsLedger(
  supabase: SupabaseClient,
  write: EarningsLedgerWrite,
): Promise<string | null> {
  const { error } = await supabase
    .from('earnings_ledger')
    .upsert(
      {
        brand_slug: write.brandSlug,
        period_month: write.periodMonth,
        team_member_id: write.teamMemberId,
        snapshot: write.snapshot as unknown as Record<string, unknown>,
        invoice_id: write.invoiceId,
        frozen_at: new Date().toISOString(),
      },
      { onConflict: 'brand_slug,period_month,team_member_id' },
    );
  if (error) {
    const msg = `earnings_ledger upsert failed for ${write.brandSlug} ${write.periodMonth}: ${error.message}`;
    console.error(`[earnings-ledger] ${msg}`);
    return msg;
  }
  return null;
}
