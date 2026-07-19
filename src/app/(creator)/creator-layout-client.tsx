'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { CreatorProfile } from '@/lib/data/creator-context';
import { CreatorSidebar } from '@/components/creator/creator-sidebar';
import { CreatorHeader } from '@/components/creator/creator-header';

/**
 * Creator portal shell — mirrors the admin/brand shell (src/components/layout/
 * brand-shell.tsx): body-scroll (min-h-screen, sticky sidebar/header, not an
 * h-screen overflow-hidden lock), a sticky top header with the profile menu at
 * the top-right, and the sidebar with the brand switcher at the bottom.
 */
export function CreatorLayoutClient({
  profile,
  children,
}: {
  profile: CreatorProfile;
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--background)' }}>
      <CreatorSidebar className="sticky top-0 hidden h-screen lg:flex" profile={profile} />

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
          <div className="relative">
            <CreatorSidebar profile={profile} onNavigate={() => setMobileNavOpen(false)} />
            <button
              onClick={() => setMobileNavOpen(false)}
              className="absolute -right-10 top-4 rounded-lg bg-card p-2 shadow"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <CreatorHeader profile={profile} onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 animate-fade-in">
          <div className="p-3 sm:p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
