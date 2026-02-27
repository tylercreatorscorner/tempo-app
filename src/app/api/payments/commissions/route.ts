import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { ACTIVE_BRANDS } from '@/lib/utils/constants';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createAdminClient();
    const brand = request.nextUrl.searchParams.get('brand') || 'all';

    // Get brand base commission rates
    let settingsQuery = supabase.from('brand_settings').select('brand, commission_rate');
    if (brand !== 'all') {
      settingsQuery = settingsQuery.eq('brand', brand);
    } else {
      settingsQuery = settingsQuery.in('brand', [...ACTIVE_BRANDS]);
    }
    const { data: brandSettings } = await settingsQuery;

    // Get creators with +1% bump
    let bumpQuery = supabase.from('creator_commission_rates').select('*');
    if (brand !== 'all') {
      bumpQuery = bumpQuery.eq('brand', brand);
    }
    const { data: bumpCreators } = await bumpQuery;

    // Get commission payments for current period
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    let commissionsQuery = supabase
      .from('creator_payments')
      .select('*')
      .eq('payment_type', 'commission')
      .eq('period_month', `${year}-${month}`);

    if (brand !== 'all') {
      commissionsQuery = commissionsQuery.eq('brand', brand);
    }

    const { data: commissions } = await commissionsQuery.order('amount', { ascending: false });

    return NextResponse.json({
      brandRates: brandSettings || [],
      bumpCreators: bumpCreators || [],
      commissions: commissions || [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
