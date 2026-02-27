import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createAdminClient();
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const currentPeriod = `${year}-${month}`;

    // Total retainer spend this month
    const { data: retainerData } = await supabase
      .from('creator_payments')
      .select('amount')
      .eq('payment_type', 'retainer')
      .eq('period_month', currentPeriod);

    const totalRetainerSpend = (retainerData || []).reduce((sum: number, r: any) => sum + (r.amount || 0), 0);

    // Total commissions owed (pending/approved, not yet paid)
    const { data: commissionData } = await supabase
      .from('creator_payments')
      .select('amount')
      .eq('payment_type', 'commission')
      .in('status', ['pending', 'approved']);

    const totalCommissionsOwed = (commissionData || []).reduce((sum: number, r: any) => sum + (r.amount || 0), 0);

    // Outstanding invoices
    const { data: outstandingInvoices } = await supabase
      .from('invoices')
      .select('id, total_amount')
      .in('status', ['pending', 'sent']);

    const outstandingCount = (outstandingInvoices || []).length;
    const outstandingAmount = (outstandingInvoices || []).reduce((sum: number, i: any) => sum + (i.total_amount || 0), 0);

    // Paid this month
    const monthStart = `${year}-${month}-01`;
    const { data: paidData } = await supabase
      .from('creator_payments')
      .select('amount')
      .eq('status', 'paid')
      .gte('date_paid', monthStart);

    const paidThisMonth = (paidData || []).reduce((sum: number, r: any) => sum + (r.amount || 0), 0);

    // Spend by brand (retainers from managed_creators + commissions from creator_payments)
    const { data: brandRetainers } = await supabase
      .from('managed_creators')
      .select('brand, retainer');

    const brandSpend: Record<string, number> = {};
    for (const r of brandRetainers || []) {
      if (r.brand && r.retainer) {
        const key = r.brand.toLowerCase();
        brandSpend[key] = (brandSpend[key] || 0) + r.retainer;
      }
    }

    // Recent activity
    const { data: recentPayments } = await supabase
      .from('creator_payments')
      .select('*')
      .order('date_submitted', { ascending: false })
      .limit(10);

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
