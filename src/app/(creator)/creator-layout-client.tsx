'use client';

import { CreatorProfile } from '@/lib/data/creator-context';
import { CreatorSidebar, CreatorMobileNav } from '@/components/creator/creator-sidebar';

export function CreatorLayoutClient({
  profile,
  children,
}: {
  profile: CreatorProfile;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#F8F9FC' }}>
      <CreatorSidebar className="hidden lg:flex" profile={profile} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <CreatorMobileNav profile={profile} />
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
