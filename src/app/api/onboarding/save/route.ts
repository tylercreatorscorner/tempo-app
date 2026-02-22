import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { email, fullName, companyName, role, agencyBrandCount } = await request.json();

    if (!email || !fullName || !companyName || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('onboarding_sessions')
      .upsert(
        {
          email: email.toLowerCase().trim(),
          full_name: fullName.trim(),
          company_name: companyName.trim(),
          role,
          agency_brand_count: agencyBrandCount || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'email' }
      )
      .select()
      .single();

    if (error) {
      console.error('Onboarding save error:', error);
      // If table doesn't exist yet, return success anyway (data is in Stripe metadata)
      if (error.code === '42P01') {
        return NextResponse.json({ ok: true, fallback: true });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data?.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('Onboarding save error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
