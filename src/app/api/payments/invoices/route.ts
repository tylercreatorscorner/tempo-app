import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { ACTIVE_BRANDS } from '@/lib/utils/constants';

export async function GET() {
  try {
    const supabase = await createAdminClient();

    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*')
      .in('brand', [...ACTIVE_BRANDS])
      .order('generated_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ invoices: invoices || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
