'use client';

import { createContext, useCallback, useContext, useTransition, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { TableLoadBar } from '@/components/ui/table-load-bar';

/**
 * ONE transition shared by every URL control in the admin shell (period picker,
 * brand switcher), so changing either shows the same pending affordance over the
 * content it invalidates.
 *
 * Why a provider rather than local state in each control: a `router.push` to a
 * dynamic route keeps the CURRENT page fully painted until the server responds.
 * Each control already knew it was waiting, but only ever dimmed ITSELF — so
 * picking "Last 30 Days" dimmed one pill while every number below it kept
 * rendering confident, now-wrong values with no sign they were stale.
 *
 * Placement is the whole point: the pickers are each wrapped in
 * `<Suspense fallback={null}>` at their 5 server call sites (a useSearchParams
 * CSR-bailout requirement), so a picker-local context would sit BELOW those
 * boundaries where no sibling could subscribe. This mounts once in AdminShell,
 * above every boundary.
 *
 * NOT a global route-progress bar (nprogress et al): those key on pathname, and
 * this app's most common navigations — brand switch, roster filters — are
 * same-pathname query-only pushes that such a bar never sees finish, so it spins
 * forever. A transition knows when it's actually done.
 */
interface NavigationPendingValue {
  isPending: boolean;
  /** Run a router.push inside the shared transition. */
  startNav: (fn: () => void) => void;
}

const NavigationPendingContext = createContext<NavigationPendingValue | null>(null);

/** Outside the provider (e.g. shared controls reused by the brand portal), run
 *  the navigation normally rather than crashing. */
const PASSTHROUGH: NavigationPendingValue = { isPending: false, startNav: (fn) => fn() };

export function NavigationPendingProvider({ children }: { children: ReactNode }) {
  const [isPending, startTransition] = useTransition();
  // startTransition is referentially stable, so this stays stable too — callers
  // put startNav in useCallback deps.
  const startNav = useCallback((fn: () => void) => startTransition(fn), [startTransition]);
  return (
    <NavigationPendingContext.Provider value={{ isPending, startNav }}>
      {children}
    </NavigationPendingContext.Provider>
  );
}

export function useNavigationPending(): NavigationPendingValue {
  return useContext(NavigationPendingContext) ?? PASSTHROUGH;
}

/**
 * Renders the shared pending affordance over the page content: an indeterminate
 * top bar plus a dim of the stale content underneath, which is the honest read —
 * those numbers are for the OLD period/brand and are being replaced.
 *
 * Gated by useDelayedFlag so a fast commit doesn't flash.
 */
export function NavigationPendingOverlay({ children }: { children: ReactNode }) {
  const { isPending } = useNavigationPending();
  const show = useDelayedFlag(isPending);
  return (
    <div className="relative">
      <TableLoadBar active={show} />
      <div className={cn('transition-opacity duration-200', show && 'opacity-60')}>{children}</div>
    </div>
  );
}
