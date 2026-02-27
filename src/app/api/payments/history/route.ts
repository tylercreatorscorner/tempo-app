import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createAdminClient();
    const brand = request.nextUrl.searchParams.get('brand') || 'all';

    let query = supabase
      .from('payment_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (brand !== 'all') {
      query = query.eq('brand', brand);
    }

    const { data: logs, error } = await query;

    // If the table doesn't exist yet, return empty
    if (error && error.message?.includes('does not exist')) {
      return NextResponse.json({ logs: [] });
    }
    if (error) throw error;

    return NextResponse.json({ logs: logs || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
