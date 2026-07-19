import { Newsreader } from 'next/font/google';
import { getCreatorProfile, CreatorProfile } from '@/lib/data/creator-context';
import { redirect } from 'next/navigation';
import { CreatorLayoutClient } from './creator-layout-client';

// "The Ledger" editorial serif — carries the hero money numbers and section
// headings. Scoped to the creator portal via `--font-serif` on a display:contents
// wrapper so it never loads on the admin app or landing pages.
const newsreader = Newsreader({
  variable: '--font-serif',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
});

export default async function CreatorLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCreatorProfile();

  if (!profile) {
    redirect('/creator-login');
  }

  return (
    <div className={`${newsreader.variable} contents`}>
      <CreatorLayoutClient profile={profile}>
        {children}
      </CreatorLayoutClient>
    </div>
  );
}
