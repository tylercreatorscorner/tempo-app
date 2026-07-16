'use client';

import { Suspense, useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { MobileNav } from '@/components/layout/mobile-nav';
import { SectionTabs } from '@/components/layout/section-tabs';
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
  viewAsBanner?: React.ReactNode;
  /** Impersonation-aware finance visibility, computed server-side in the admin
   *  layout. useTenant is client-side + reads the REAL user (not the "view as"
   *  target), so the sidebar's Finance gate must come from here. */
  canViewFinance?: boolean;
  /** Impersonation-aware owner/admin flag — gates the header's User Management entry. */
  isAdmin?: boolean;
  /** Initial collapsed state, read from the `sidebar_collapsed` cookie server-side
   *  so the first paint matches (no expand→collapse flash on load). */
  defaultCollapsed?: boolean;
}

export function AdminShell({ children, tenantSwitcher, viewAsBanner, canViewFinance = true, isAdmin = false, defaultCollapsed = false }: AdminShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const { tenant, userName, userEmail } = useTenant();

  const toggleCollapse = () =>
    setCollapsed((v) => {
      const next = !v;
      document.cookie = `sidebar_collapsed=${next ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });

  return (
    <Suspense>
    <BrandProvider>
    <BreadcrumbProvider>
    <VideoPanelProvider>
      {/* Body-scroll layout: removed the outer h-screen+overflow-hidden lock
          so the scroll wheel works from anywhere on the page (including
          while hovering the sidebar). Sidebar is now `sticky top-0 h-screen`
          internally so it stays pinned while the document scrolls. */}
      <div className="flex min-h-screen" style={{ backgroundColor: 'var(--background)' }}>
        <Sidebar className="hidden lg:flex" isAdmin={isAdmin} canViewFinance={canViewFinance} collapsed={collapsed} onToggleCollapse={toggleCollapse} />
        <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} isAdmin={isAdmin} canViewFinance={canViewFinance} />

        <div className="flex-1 flex flex-col min-w-0">
          <Header
            onMenuClick={() => setMobileNavOpen(true)}
            tenantName={tenant?.name}
            userName={userName}
            userEmail={userEmail}
            tenantSwitcher={tenantSwitcher}
            isAdmin={isAdmin}
          />
          <SectionTabs isAdmin={isAdmin} />
          <main className="flex-1 animate-fade-in">
            <div className="px-3 sm:px-4 md:px-6 pt-3 sm:pt-4 space-y-3">
              {viewAsBanner}
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
