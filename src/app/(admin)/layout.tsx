'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { MobileNav } from '@/components/layout/mobile-nav';
import { useTenant } from '@/hooks/use-tenant';
import { VideoPanelProvider } from '@/components/video/video-panel-context';
import { VideoPlayerPanel } from '@/components/video/video-player-panel';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { tenant, isMultiBrand } = useTenant();

  return (
    <VideoPanelProvider>
      <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#F8F9FC' }}>
        <Sidebar className="hidden lg:flex" />
        <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Header
            onMenuClick={() => setMobileNavOpen(true)}
            showBrandFilter={isMultiBrand}
            tenantName={tenant?.name}
          />
          <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 animate-fade-in">
            {children}
          </main>
        </div>
      </div>
      <VideoPlayerPanel />
    </VideoPanelProvider>
  );
}
