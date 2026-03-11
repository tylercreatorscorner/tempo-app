'use client';

import { Suspense, useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { MobileNav } from '@/components/layout/mobile-nav';
import { useTenant } from '@/hooks/use-tenant';
import { VideoPanelProvider } from '@/components/video/video-panel-context';
import { VideoPlayerPanel } from '@/components/video/video-player-panel';
import { BrandProvider } from '@/hooks/use-global-brand';
import { SetupBanner } from '@/components/onboarding/setup-banner';
import { DashboardGate } from '@/components/onboarding/dashboard-gate';
import { FirstSyncToast } from '@/components/onboarding/first-sync-toast';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { tenant, isMultiBrand, isOwner, userName, userEmail } = useTenant();

  return (
    <Suspense>
    <BrandProvider>
    <VideoPanelProvider>
      <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#F8F9FC' }}>
        <Sidebar className="hidden lg:flex" userRole={isOwner && isMultiBrand ? 'owner' : 'customer'} />
        <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Header
            onMenuClick={() => setMobileNavOpen(true)}
            tenantName={tenant?.name}
            userName={userName}
            userEmail={userEmail}
          />
          <main className="flex-1 overflow-y-auto animate-fade-in">
            <SetupBanner />
            <div className="p-3 sm:p-4 md:p-6 pt-0">
              <DashboardGate>
                {children}
              </DashboardGate>
            </div>
          </main>
        </div>
      </div>
      <VideoPlayerPanel />
      <Suspense><FirstSyncToast /></Suspense>
    </VideoPanelProvider>
    </BrandProvider>
    </Suspense>
  );
}
