import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { AdminShell } from '@/components/layout/admin-shell';
import { TenantSwitcherServer } from '@/components/layout/tenant-switcher-server';
import { ViewAsBannerServer } from '@/components/layout/view-as-banner-server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { can, SCREENS } from '@/lib/auth/permissions';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Impersonation-aware finance visibility for the sidebar: when "viewing as" a
  // member, getWorkspaceScope resolves AS that member, so a finance-blind target
  // hides the Finance section. useTenant (client) can't do this — it reads the
  // real logged-in user, not the "view as" target.
  const scope = await getWorkspaceScope();
  const isAdmin = scope?.role === 'owner' || scope?.role === 'admin';
  /**
   * What the nav is allowed to offer, straight from the matrix.
   *
   * ⚠️ HIDING A TAB IS NOT ACCESS CONTROL and never was: the route still
   * answers. Every section now has a layout guard that enforces server-side.
   * This exists so the nav and the guard agree, rather than offering a
   * destination that bounces you straight back.
   */
  const navPerms = scope
    ? Object.fromEntries(SCREENS.map((s) => [s, can(scope, s, 'read')]))
    : {};
  // Fail CLOSED on finance. getWorkspaceScope returns null precisely when the
  // user can't be identified as a Workspace user (no profile, no tenant, a
  // portal role, an unknown role, or a failed profile read) — and `?? true`
  // granted the Finance nav to exactly those users. Middleware normally bounces
  // them before this renders, but the layout must not assume it's the only gate;
  // an unidentifiable viewer showing Finance is the audit-#5 shape. Hiding a nav
  // item is the right direction to fail (pages enforce server-side regardless).
  const canViewFinance = scope?.canViewFinance ?? false;
  // Sidebar collapsed state persists in a cookie so the first paint matches the
  // user's last choice (no expand→collapse flash on load).
  const collapsed = (await cookies()).get('sidebar_collapsed')?.value === '1';
  return (
    <AdminShell
      tenantSwitcher={<Suspense><TenantSwitcherServer /></Suspense>}
      viewAsBanner={<Suspense><ViewAsBannerServer /></Suspense>}
      canViewFinance={canViewFinance}
      isAdmin={isAdmin}
      navPerms={navPerms}
      defaultCollapsed={collapsed}
    >
      {children}
    </AdminShell>
  );
}
