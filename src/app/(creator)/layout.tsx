import { getCreatorProfile, CreatorProfile } from '@/lib/data/creator-context';
import { redirect } from 'next/navigation';
import { CreatorLayoutClient } from './creator-layout-client';

export default async function CreatorLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCreatorProfile();

  if (!profile) {
    redirect('/creator-login');
  }

  return (
    <CreatorLayoutClient profile={profile}>
      {children}
    </CreatorLayoutClient>
  );
}
