import { redirect } from 'next/navigation';
import { getCreatorSession } from '@/lib/auth/creator-auth';
import { createAdminClient } from '@/lib/supabase/server';
import { SettingsClient } from './settings-client';

export default async function CreatorSettingsPage() {
  const session = await getCreatorSession();
  if (!session) redirect('/creator-login');
  const creatorId = String(session.creatorId);

  // Admin client: the creator authenticates by JWT (no Supabase user for RLS).
  const supabase = await createAdminClient();
  const [{ data: cv }, { data: accounts }] = await Promise.all([
    supabase.from('creators_v2').select('real_name, email').eq('id', creatorId).maybeSingle(),
    supabase
      .from('tiktok_accounts')
      .select('id, tiktok_username, is_primary, verified')
      .eq('creator_id', creatorId)
      .order('is_primary', { ascending: false }),
  ]);

  return (
    <SettingsClient
      realName={cv?.real_name || 'Creator'}
      email={cv?.email || null}
      accounts={(accounts ?? [])
        .filter((a) => a.tiktok_username)
        .map((a) => ({
          id: a.id,
          username: a.tiktok_username,
          isPrimary: !!a.is_primary,
          verified: !!a.verified,
        }))}
    />
  );
}
