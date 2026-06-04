/**
 * Creator contact-collection onboarding step.
 *
 * Shown once after first magic-link verify (the verify route redirects here
 * when creators_v2.contact_onboarding_at is null). Collects email + phone and
 * an explicit SMS opt-in. Lives outside the (creator) route group so it's a
 * focused full-screen step without the dashboard sidebar.
 */
import { redirect } from 'next/navigation';
import { getCreatorSession } from '@/lib/auth/creator-auth';
import { createAdminClient } from '@/lib/supabase/server';
import { OnboardingForm } from './onboarding-form';

export const dynamic = 'force-dynamic';

export default async function CreatorOnboardingPage() {
  const session = await getCreatorSession();
  if (!session) redirect('/creator-login');

  // Prefill from whatever we already have on creators_v2.
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from('creators_v2')
    .select('real_name, email, phone')
    .eq('id', String(session.creatorId))
    .maybeSingle();

  const row = data as { real_name: string | null; email: string | null; phone: string | null } | null;

  return (
    <OnboardingForm
      firstName={(row?.real_name ?? '').split(/\s+/)[0] || null}
      initialEmail={row?.email ?? session.email ?? ''}
      initialPhone={row?.phone ?? ''}
    />
  );
}
