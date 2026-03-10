import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';

/** OAuth callback handler — exchanges code for session, provisions tenant if needed */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Check if user needs tenant provisioning (first OAuth login)
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const admin = await createAdminClient();
        const { data: profile } = await admin
          .from('user_profiles')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (!profile) {
          // First login via OAuth — provision tenant + profile
          const name = user.user_metadata?.full_name || user.user_metadata?.name || '';
          const email = user.email || '';
          const company = name ? `${name}'s Brand` : 'My Brand';

          // Create tenant
          const { data: tenant } = await admin
            .from('tenants')
            .insert({ name: company, plan: 'starter', max_brands: 1 })
            .select('id')
            .single();

          if (tenant) {
            // Create user profile
            await admin.from('user_profiles').insert({
              user_id: user.id,
              email,
              name,
              role: 'owner',
              tenant_id: tenant.id,
            });
          }
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
