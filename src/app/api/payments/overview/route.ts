/**
 * GET /api/payments/overview
 *
 * Headline payment stats for the Payments page. Every read is individually
 * error-checked and paged past the 1000-row PostgREST cap: a failed or
 * truncated money read must 500, never silently sum to a fake $0 (the old
 * version destructured `data` off five reads with no error check).
 *
 * NOTE (Phase 2 decision, not addressed here): every creator_payments-sourced
 * figure reads from a table nothing currently writes — the retainer-spend /
 * commissions-owed / paid-this-month numbers are structurally $0 until the
 * write side exists or the source changes.
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { getBrandRegistry, activeBrandSlugs } from '@/lib/data/brand-registry';
import { fetchAllRows } from '@/lib/data/fetch-all-rows';

interface AmountBrandRow { amount: number | null; brand: string | null; id?: string }
interface InvoiceAmountRow { id: string; total_amount: number | null; brand: string | null }
interface BrandRetainerRow { brand: string | null; retainer: number | null; id?: string }

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
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const currentPeriod = `${year}-${month}`;
    const monthStart = `${year}-${month}-01`;

    // Independent reads — run together. fetchAllRows throws on any error,
    // which the outer catch turns into a 500 (never a fabricated $0).
    const [retainerData, commissionData, outstandingInvoices, paidData, brandRetainers, recentRes] =
      await Promise.all([
        // Total retainer spend this month
        fetchAllRows<AmountBrandRow>(() => {
          let q = supabase
            .from('creator_payments')
            .select('id, amount, brand')
            .eq('payment_type', 'retainer')
            .eq('period_month', currentPeriod);
          if (scopedSlugs) q = q.in('brand', scopedSlugs);
          return q.order('id', { ascending: true });
        }, 'payments-overview'),
        // Total commissions owed (pending/approved, not yet paid)
        fetchAllRows<AmountBrandRow>(() => {
          let q = supabase
            .from('creator_payments')
            .select('id, amount, brand')
            .eq('payment_type', 'commission')
            .in('status', ['pending', 'approved']);
          if (scopedSlugs) q = q.in('brand', scopedSlugs);
          return q.order('id', { ascending: true });
        }, 'payments-overview'),
        // Outstanding invoices
        fetchAllRows<InvoiceAmountRow>(() => {
          let q = supabase
            .from('invoices')
            .select('id, total_amount, brand')
            .in('status', ['pending', 'sent']);
          if (scopedSlugs) q = q.in('brand', scopedSlugs);
          return q.order('id', { ascending: true });
        }, 'payments-overview'),
        // Paid this month
        fetchAllRows<AmountBrandRow>(() => {
          let q = supabase
            .from('creator_payments')
            .select('id, amount, brand')
            .eq('status', 'paid')
            .gte('date_paid', monthStart);
          if (scopedSlugs) q = q.in('brand', scopedSlugs);
          return q.order('id', { ascending: true });
        }, 'payments-overview'),
        // Spend by brand — managed_creators exceeds the 1000-row cap, so an
        // un-paged read here silently under-counted brand retainer spend.
        fetchAllRows<BrandRetainerRow>(() =>
          supabase
            .from('managed_creators')
            .select('id, brand, retainer')
            .in('brand', scopedSlugs ?? activeBrandSlugs(reg))
            .order('id', { ascending: true }), 'payments-overview'),
        // Recent activity (limit 10 — no paging, but the error IS checked)
        (() => {
          let q = supabase
            .from('creator_payments')
            .select('*')
            .order('date_submitted', { ascending: false })
            .limit(10);
          if (scopedSlugs) q = q.in('brand', scopedSlugs);
          return q;
        })(),
      ]);

    if (recentRes.error) {
      return NextResponse.json({ error: `creator_payments recent read failed: ${recentRes.error.message}` }, { status: 500 });
    }

    const totalRetainerSpend = retainerData.reduce((sum, r) => sum + (r.amount || 0), 0);
    const totalCommissionsOwed = commissionData.reduce((sum, r) => sum + (r.amount || 0), 0);
    const outstandingCount = outstandingInvoices.length;
    const outstandingAmount = outstandingInvoices.reduce((sum, i) => sum + (i.total_amount || 0), 0);
    const paidThisMonth = paidData.reduce((sum, r) => sum + (r.amount || 0), 0);

    const brandSpend: Record<string, number> = {};
    for (const r of brandRetainers) {
      if (r.brand && r.retainer) {
        const key = r.brand.toLowerCase();
        brandSpend[key] = (brandSpend[key] || 0) + r.retainer;
      }
    }

    return NextResponse.json({
      totalRetainerSpend,
      totalCommissionsOwed,
      outstandingInvoices: outstandingCount,
      outstandingAmount,
      paidThisMonth,
      brandSpend,
      recentActivity: recentRes.data ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load payments overview';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
