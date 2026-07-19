import { getCreatorProfile, CreatorProfile } from '@/lib/data/creator-context';
import { redirect } from 'next/navigation';
import { CreatorLayoutClient } from './creator-layout-client';

// The Ledger's serif is the SYSTEM stack (.font-ledger in globals.css) — no
// webfont here on purpose; Newsreader was tried and didn't match the approved
// mockup's Palatino/Georgia look.

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
