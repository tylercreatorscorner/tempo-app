import { Suspense } from 'react';
import { AdminShell } from '@/components/layout/admin-shell';
import { TenantSwitcherServer } from '@/components/layout/tenant-switcher-server';
import { ManagerSwitcherServer } from '@/components/layout/manager-switcher-server';
import { ViewAsBannerServer } from '@/components/layout/view-as-banner-server';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminShell
      tenantSwitcher={
        <Suspense>
          <div className="flex items-center gap-2">
            <TenantSwitcherServer />
            <ManagerSwitcherServer />
          </div>
        </Suspense>
      }
      viewAsBanner={<Suspense><ViewAsBannerServer /></Suspense>}
    >
      {children}
    </AdminShell>
  );
}
