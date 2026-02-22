import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const supabase = await createAdminClient();

    // Check user_profiles for existing accounts
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, email')
      .eq('email', email.toLowerCase().trim())
      .limit(1);

    if (error) {
      // If RLS recursion or table issue, just allow through
      console.error('Email check error:', error);
      return NextResponse.json({ exists: false });
    }

    return NextResponse.json({ exists: (data?.length ?? 0) > 0 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('Email check error:', message);
    return NextResponse.json({ exists: false });
  }
}
