import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { AdminShell } from '@/components/layout/admin-shell';
import { TenantSwitcherServer } from '@/components/layout/tenant-switcher-server';
import { ViewAsBannerServer } from '@/components/layout/view-as-banner-server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Impersonation-aware finance visibility for the sidebar: when "viewing as" a
  // member, getWorkspaceScope resolves AS that member, so a finance-blind target
  // hides the Finance section. useTenant (client) can't do this — it reads the
  // real logged-in user, not the "view as" target.
  const scope = await getWorkspaceScope();
  const isAdmin = scope?.role === 'owner' || scope?.role === 'admin';
  // Sidebar collapsed state persists in a cookie so the first paint matches the
  // user's last choice (no expand→collapse flash on load).
  const collapsed = (await cookies()).get('sidebar_collapsed')?.value === '1';
  return (
    <AdminShell
      tenantSwitcher={<Suspense><TenantSwitcherServer /></Suspense>}
      viewAsBanner={<Suspense><ViewAsBannerServer /></Suspense>}
      canViewFinance={scope?.canViewFinance ?? true}
      isAdmin={isAdmin}
      defaultCollapsed={collapsed}
    >
      {children}
    </AdminShell>
  );
}
