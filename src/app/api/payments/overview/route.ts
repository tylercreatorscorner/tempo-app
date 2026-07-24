/**
 * GET /api/payments/overview
 *
 * Headline figures for the Payments page — REAL sources only:
 *
 *   retainerBook     — SUM(managed_creators.retainer) over active (non-archived)
 *                      managed creators, deduped by (creator_id, brand) taking
 *                      MAX. Mirrors the dashboard's fetchRetainerBySlug / the
 *                      roster's Total Retainers exactly, so the three tie out.
 *   outstanding      — invoices in pending/sent ($ + count)
 *   overdue          — open (pending or sent) invoices past their due_date
 *                      ($ + count) — THE shared rule from lib/finance/overdue,
 *                      so drafts count and this KPI ties to the board/chips
 *   collected        — invoices with paid_at inside the current month
 *   brandSpend       — the retainer book split by brand (chart source)
 *
 * The old version read retainer spend / commissions owed / paid-this-month
 * from creator_payments — a table with ONE row ever written. Those figures were
 * structurally fake and are gone; creator payout tracking arrives with the
 * payouts release.
 *
 * Every read is error-checked and paged past the 1000-row PostgREST cap via
 * fetchAllRows (throws → 500). A failed money read must surface as an error,
 * never a fabricated $0.
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { getBrandRegistry, activeBrandSlugs } from '@/lib/data/brand-registry';
import { fetchAllRows } from '@/lib/data/fetch-all-rows';
import { isOverdue } from '@/lib/finance/overdue';

export const runtime = 'nodejs';

interface RetainerRow { id: string; creator_id: string | null; brand: string | null; retainer: number | null }
interface OpenInvoiceRow { id: string; total_amount: number | null; brand: string | null; status: string; due_date: string | null }
interface PaidInvoiceRow { id: string; total_amount: number | null; brand: string | null; paid_at: string | null }

export async function GET() {
  try {
    const scope = await getWorkspaceScope();
    if (!scope) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!scope.canViewFinance) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Managers: every figure is restricted to their brands. owner/admin: all.
    const scopedSlugs = scope.brandScope.kind === 'scoped'
      ? (scope.brandScope.brandSlugs.length ? scope.brandScope.brandSlugs : ['__none__'])
      : null;

    const supabase = await createAdminClient();
    const reg = await getBrandRegistry();
    // managed_creators.brand is keyed at umbrella grain — same slug set the
    // dashboard's retainer sum uses.
    const brandSlugs = scopedSlugs ?? activeBrandSlugs(reg);

    const now = new Date();
    const year = now.getUTCFullYear();
    const monthIdx = now.getUTCMonth();
    const monthStart = new Date(Date.UTC(year, monthIdx, 1)).toISOString();
    const nextMonthStart = new Date(Date.UTC(year, monthIdx + 1, 1)).toISOString();
    const todayIso = now.toISOString().split('T')[0];

    const [retainerRows, openInvoices, paidInvoices] = await Promise.all([
      // Retainer book — active roster only (archived_at null).
      fetchAllRows<RetainerRow>(() =>
        supabase
          .from('managed_creators')
          .select('id, creator_id, brand, retainer')
          .is('archived_at', null)
          .in('brand', brandSlugs)
          .order('id', { ascending: true }), 'payments-overview'),
      // Open invoices (pending + sent) — outstanding and overdue both derive here.
      fetchAllRows<OpenInvoiceRow>(() => {
        let q = supabase
          .from('invoices')
          .select('id, total_amount, brand, status, due_date')
          .in('status', ['pending', 'sent']);
        if (scopedSlugs) q = q.in('brand', scopedSlugs);
        return q.order('id', { ascending: true });
      }, 'payments-overview'),
      // Collected this month.
      fetchAllRows<PaidInvoiceRow>(() => {
        let q = supabase
          .from('invoices')
          .select('id, total_amount, brand, paid_at')
          .eq('status', 'paid')
          .gte('paid_at', monthStart)
          .lt('paid_at', nextMonthStart);
        if (scopedSlugs) q = q.in('brand', scopedSlugs);
        return q.order('id', { ascending: true });
      }, 'payments-overview'),
    ]);

    // Dedup by (creator_id, brand) taking MAX — matching /api/roster and the
    // dashboard exactly, so re-add / merged-identity duplicate rows don't
    // double-count the monthly commitment. Rows without a creator_id sum raw.
    const maxByCreatorBrand = new Map<string, { brand: string; retainer: number }>();
    const brandSpend: Record<string, number> = {};
    let retainerBook = 0;
    let retainerCreatorCount = 0;
    const addToBrand = (brand: string, amount: number) => {
      const key = brand.toLowerCase();
      brandSpend[key] = (brandSpend[key] || 0) + amount;
    };
    for (const r of retainerRows) {
      if (!r.brand) continue;
      const ret = Number(r.retainer) || 0;
      if (r.creator_id) {
        const key = `${r.creator_id}|${r.brand}`;
        const prev = maxByCreatorBrand.get(key);
        if (!prev || ret > prev.retainer) maxByCreatorBrand.set(key, { brand: r.brand, retainer: ret });
      } else if (ret > 0) {
        retainerBook += ret;
        retainerCreatorCount += 1;
        addToBrand(r.brand, ret);
      }
    }
    for (const { brand, retainer } of maxByCreatorBrand.values()) {
      if (retainer <= 0) continue;
      retainerBook += retainer;
      retainerCreatorCount += 1;
      addToBrand(brand, retainer);
    }

    let outstandingAmount = 0;
    let overdueAmount = 0;
    let overdueCount = 0;
    for (const inv of openInvoices) {
      const amt = Number(inv.total_amount) || 0;
      outstandingAmount += amt;
      // Overdue = THE shared rule (lib/finance/overdue): pending or sent, past
      // due — drafts COUNT, matching the board, chips, and aging panel.
      if (isOverdue(inv, todayIso)) {
        overdueAmount += amt;
        overdueCount += 1;
      }
    }

    const collectedAmount = paidInvoices.reduce((sum, i) => sum + (Number(i.total_amount) || 0), 0);

    return NextResponse.json({
      retainerBook,
      retainerCreatorCount,
      outstandingAmount,
      outstandingCount: openInvoices.length,
      overdueAmount,
      overdueCount,
      collectedAmount,
      collectedCount: paidInvoices.length,
      brandSpend,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load payments overview';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
