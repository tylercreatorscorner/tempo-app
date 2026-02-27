import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createAdminClient();
    const brand = request.nextUrl.searchParams.get('brand') || 'all';

    // Get managed creators with retainers
    let query = supabase
      .from('managed_creators')
      .select('*')
      .gt('retainer', 0);

    if (brand !== 'all') {
      query = query.eq('brand', brand);
    }

    const { data: creators, error } = await query.order('creator_name');
    if (error) throw error;

    // Get post counts for current period
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const periodStart = `${year}-${month}-01`;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const periodEnd = yesterday.toISOString().split('T')[0];

    // Get payment records for this period to check post verification
    const { data: payments } = await supabase
      .from('creator_payments')
      .select('creator_name, brand, posts_found, posting_verified, status')
      .eq('payment_type', 'retainer')
      .eq('period_month', `${year}-${month}`);

    const paymentMap: Record<string, any> = {};
    for (const p of payments || []) {
      paymentMap[`${p.creator_name}|${p.brand}`] = p;
    }

    const totalRetainerSpend = (creators || []).reduce((sum: number, c: any) => sum + (c.retainer || 0), 0);

    const enriched = (creators || []).map((c: any) => {
      const key = `${c.creator_name}|${c.brand}`;
      const payment = paymentMap[key];
      const postsFound = payment?.posts_found ?? 0;
      const postsRequired = c.monthly_post_requirement ?? 0;

      let status = 'On Track';
      if (postsRequired > 0) {
        const dayOfMonth = now.getDate();
        const daysInMonth = new Date(year, now.getMonth() + 1, 0).getDate();
        const expectedPace = (postsRequired / daysInMonth) * dayOfMonth;
        if (postsFound < expectedPace * 0.5) {
          status = 'At Risk';
        } else if (postsFound < expectedPace * 0.8) {
          status = 'Behind';
        }
      }

      return {
        ...c,
        posts_found: postsFound,
        posts_required: postsRequired,
        status,
        payment_status: payment?.status || 'pending',
      };
    });

    return NextResponse.json({
      creators: enriched,
      totalRetainerSpend,
      periodStart,
      periodEnd,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
