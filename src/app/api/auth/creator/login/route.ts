import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { generateMagicToken } from '@/lib/auth/creator-auth';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const supabase = await createAdminClient();

    // Find creator by email
    const { data: creator } = await supabase
      .from('managed_creators')
      .select('id, email, real_name, tenant_id')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (!creator) {
      // Don't reveal whether email exists
      return NextResponse.json({ success: true, message: 'If that email is registered, a login link has been sent.' });
    }

    // Generate magic link token
    const token = await generateMagicToken({
      creatorId: creator.id,
      email: creator.email,
      tenantId: creator.tenant_id,
    });

    const verifyUrl = `${request.nextUrl.origin}/api/auth/creator/verify?token=${token}`;

    // TODO: Send email with verifyUrl
    // For now, log it and return it in dev mode
    console.log(`[Creator Login] Magic link for ${email}: ${verifyUrl}`);

    const response: Record<string, any> = {
      success: true,
      message: 'If that email is registered, a login link has been sent.',
    };

    // In development, return the link directly
    if (process.env.NODE_ENV !== 'production') {
      response.dev_login_url = verifyUrl;
    }

    return NextResponse.json(response);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
