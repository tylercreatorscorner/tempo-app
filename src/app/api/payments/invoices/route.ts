import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createAdminClient();

    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*')
      .order('generated_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ invoices: invoices || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
