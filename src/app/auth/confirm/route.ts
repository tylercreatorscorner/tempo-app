import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

/** Email confirmation handler — verifies OTP, provisions tenant + profile */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const code = searchParams.get('code');

  const supabase = await createClient();

  // Method 1: Supabase PKCE flow (code exchange)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await provisionTenant(user);
      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  // Method 2: OTP token hash verification
  if (token_hash && type) {
    const { error, data } = await supabase.auth.verifyOtp({
      type: type as 'signup' | 'email',
      token_hash,
    });
    if (!error && data.user) {
      await provisionTenant(data.user);
      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  // Method 3: User might already be authenticated (Supabase handled verification)
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await provisionTenant(user);
    return NextResponse.redirect(`${origin}/dashboard`);
  }

  return NextResponse.redirect(`${origin}/login?error=confirmation_failed`);
}

/** Create tenant + user_profile if they don't exist yet */
async function provisionTenant(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }) {
  try {
    const admin = await createAdminClient();
    const email = user.email?.toLowerCase() || '';
    const orgName = (user.user_metadata?.org_name as string) || '';
    const accountType = (user.user_metadata?.account_type as string) || 'brand';

    // Check if profile already exists (idempotent)
    const { data: existing } = await admin
      .from('user_profiles')
      .select('id, tenant_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing?.tenant_id) return; // Already provisioned

    // Check if there's a profile by email (from Stripe webhook or onboarding)
    const { data: byEmail } = await admin
      .from('user_profiles')
      .select('id, tenant_id')
      .eq('email', email)
      .maybeSingle();

    if (byEmail?.tenant_id) {
      // Link existing profile to auth user
      await admin
        .from('user_profiles')
        .update({ user_id: user.id })
        .eq('id', byEmail.id);
      return;
    }

    // Create new tenant
    const slug = orgName
      ? orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      : email.split('@')[0];

    const { data: tenant, error: tenantError } = await admin
      .from('tenants')
      .insert({
        name: orgName || email.split('@')[0],
        slug: `${slug}-${Date.now()}`,
        plan: accountType === 'agency' ? 'agency' : 'brand',
        max_brands: accountType === 'agency' ? 25 : 1,
        onboarding_complete: false,
      })
      .select()
      .single();

    if (tenantError) {
      console.error('Tenant creation error:', tenantError);
      return;
    }

    // Create user profile
    const { error: profileError } = await admin
      .from('user_profiles')
      .insert({
        user_id: user.id,
        email,
        name: orgName || email.split('@')[0],
        role: 'owner',
        tenant_id: tenant.id,
      });

    if (profileError) {
      console.error('Profile creation error:', profileError);
    }

    console.log('Provisioned tenant for:', email, 'tenant:', tenant.id);
  } catch (err) {
    console.error('Provision error:', err);
  }
}
