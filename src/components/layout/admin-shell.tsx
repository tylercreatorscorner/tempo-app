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
import { BreadcrumbProvider } from '@/components/layout/breadcrumb-context';

interface AdminShellProps {
  children: React.ReactNode;
  tenantSwitcher?: React.ReactNode;
}

export function AdminShell({ children, tenantSwitcher }: AdminShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { tenant, isOwner, userName, userEmail } = useTenant();

  return (
    <Suspense>
    <BrandProvider>
    <BreadcrumbProvider>
    <VideoPanelProvider>
      <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#F8F9FC' }}>
        <Sidebar className="hidden lg:flex" userRole={isOwner ? 'owner' : 'customer'} />
        <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} userRole={isOwner ? 'owner' : 'customer'} />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Header
            onMenuClick={() => setMobileNavOpen(true)}
            tenantName={tenant?.name}
            userName={userName}
            userEmail={userEmail}
            tenantSwitcher={tenantSwitcher}
          />
          <main className="flex-1 overflow-y-auto animate-fade-in">
            <div className="px-3 sm:px-4 md:px-6 pt-3 sm:pt-4">
              <SetupBanner />
            </div>
            <div className="p-3 sm:p-4 md:p-6 pt-2">
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
    </BreadcrumbProvider>
    </BrandProvider>
    </Suspense>
  );
}
