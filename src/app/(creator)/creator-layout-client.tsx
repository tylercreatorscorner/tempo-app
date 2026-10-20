'use client';

import portal from '@/components/layout/portal-workspace.module.css';

import { useRef, useState } from 'react';
import { PortalMobileDrawer } from '@/components/layout/portal-mobile-drawer';
import { CreatorProfile } from '@/lib/data/creator-context';
import { CreatorSidebar } from '@/components/creator/creator-sidebar';
import { CreatorHeader } from '@/components/creator/creator-header';
import {
  NavigationPendingProvider,
  NavigationPendingOverlay,
} from '@/components/layout/navigation-pending';

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
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <NavigationPendingProvider>
    <div className={`${portal.theme} flex min-h-dvh`} style={{ backgroundColor: 'var(--background)' }}>
      <a href="#creator-content" onClick={() => setMobileNavOpen(false)} className={portal.skipLink}>Skip to content</a>
      <CreatorSidebar className="sticky top-0 hidden h-dvh lg:flex" profile={profile} />

      <PortalMobileDrawer open={mobileNavOpen} onOpenChange={setMobileNavOpen} triggerRef={menuTriggerRef} id="creator-mobile-navigation" title="Creator navigation">
        <CreatorSidebar className={portal.drawerSidebar} profile={profile} onNavigate={() => setMobileNavOpen(false)} />
      </PortalMobileDrawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <CreatorHeader profile={profile} onMenuClick={() => setMobileNavOpen(true)} menuButtonRef={menuTriggerRef} mobileNavOpen={mobileNavOpen} />
        <main id="creator-content" tabIndex={-1} className="min-w-0 flex-1">
          <div className={portal.content}>
            <NavigationPendingOverlay>{children}</NavigationPendingOverlay>
          </div>
        </main>
      </div>
    </div>
    </NavigationPendingProvider>
  );
}
