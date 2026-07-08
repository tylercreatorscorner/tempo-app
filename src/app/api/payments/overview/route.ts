import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { getBrandRegistry, activeBrandSlugs } from '@/lib/data/brand-registry';

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

    // Total retainer spend this month
    let retainerQ = supabase
      .from('creator_payments')
      .select('amount, brand')
      .eq('payment_type', 'retainer')
      .eq('period_month', currentPeriod);
    if (scopedSlugs) retainerQ = retainerQ.in('brand', scopedSlugs);
    const { data: retainerData } = await retainerQ;

    const totalRetainerSpend = (retainerData || []).reduce((sum: number, r: any) => sum + (r.amount || 0), 0);

    // Total commissions owed (pending/approved, not yet paid)
    let commissionQ = supabase
      .from('creator_payments')
      .select('amount, brand')
      .eq('payment_type', 'commission')
      .in('status', ['pending', 'approved']);
    if (scopedSlugs) commissionQ = commissionQ.in('brand', scopedSlugs);
    const { data: commissionData } = await commissionQ;

    const totalCommissionsOwed = (commissionData || []).reduce((sum: number, r: any) => sum + (r.amount || 0), 0);

    // Outstanding invoices
    let outstandingQ = supabase
      .from('invoices')
      .select('id, total_amount, brand')
      .in('status', ['pending', 'sent']);
    if (scopedSlugs) outstandingQ = outstandingQ.in('brand', scopedSlugs);
    const { data: outstandingInvoices } = await outstandingQ;

    const outstandingCount = (outstandingInvoices || []).length;
    const outstandingAmount = (outstandingInvoices || []).reduce((sum: number, i: any) => sum + (i.total_amount || 0), 0);

    // Paid this month
    const monthStart = `${year}-${month}-01`;
    let paidQ = supabase
      .from('creator_payments')
      .select('amount, brand')
      .eq('status', 'paid')
      .gte('date_paid', monthStart);
    if (scopedSlugs) paidQ = paidQ.in('brand', scopedSlugs);
    const { data: paidData } = await paidQ;

    const paidThisMonth = (paidData || []).reduce((sum: number, r: any) => sum + (r.amount || 0), 0);

    // Spend by brand (retainers from managed_creators + commissions from creator_payments)
    const { data: brandRetainers } = await supabase
      .from('managed_creators')
      .select('brand, retainer')
      .in('brand', scopedSlugs ?? activeBrandSlugs(reg));

    const brandSpend: Record<string, number> = {};
    for (const r of brandRetainers || []) {
      if (r.brand && r.retainer) {
        const key = r.brand.toLowerCase();
        brandSpend[key] = (brandSpend[key] || 0) + r.retainer;
      }
    }

    // Recent activity
    let recentQ = supabase
      .from('creator_payments')
      .select('*')
      .order('date_submitted', { ascending: false })
      .limit(10);
    if (scopedSlugs) recentQ = recentQ.in('brand', scopedSlugs);
    const { data: recentPayments } = await recentQ;

    return NextResponse.json({
      totalRetainerSpend,
      totalCommissionsOwed,
      outstandingInvoices: outstandingCount,
      outstandingAmount,
      paidThisMonth,
      brandSpend,
      recentActivity: recentPayments || [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
