'use client';

import { useEffect, useRef } from 'react';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sidebar } from './sidebar';

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
  isAdmin?: boolean;
  canViewFinance?: boolean;
  /** Passed straight through: the drawer renders the same Sidebar. */
  navPerms?: Record<string, boolean>;
}

/**
 * Below-lg slide-out nav. Always mounted so it animates BOTH in and out
 * (transform + backdrop-opacity transitions); a left-anchored drawer slides
 * from the left (-translate-x-full → 0), and taps/pointer events pass through
 * when closed. Escape closes it.
 */
export function MobileNav({ open, onClose, isAdmin = false, canViewFinance = true, navPerms }: MobileNavProps) {
  const drawer = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useBodyScrollLock(open);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    drawer.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close.current();
      if (e.key !== 'Tab') return;
      const controls = [...(drawer.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),[tabindex="0"]') ?? [])].filter(node => node.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', onKey);
    const desktop = window.matchMedia('(min-width: 1024px)');
    const onResize = () => { if (desktop.matches) close.current(); };
    desktop.addEventListener('change', onResize);
    return () => { document.removeEventListener('keydown', onKey); desktop.removeEventListener('change', onResize); opener?.focus(); };
  }, [open]);

  return (
    <div className={cn('fixed inset-0 z-50 lg:hidden', !open && 'pointer-events-none')} aria-hidden={!open} inert={!open}>
      {/* Backdrop — fades */}
      <div
        onClick={onClose}
        className={cn(
          'fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0',
        )}
      />
      {/* Drawer — slides in from the left, out to the left */}
      <div
        ref={drawer}
        role="dialog"
        aria-modal={open || undefined}
        aria-label="Workspace navigation"
        onClick={event => { if ((event.target as HTMLElement).closest('a[href]')) onClose(); }}
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 max-w-[calc(100vw-32px)] overscroll-contain transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <button
          onClick={onClose}
          className="absolute top-[max(12px,env(safe-area-inset-top))] right-2 z-10 grid size-11 place-items-center rounded-lg transition-colors hover:bg-muted"
          aria-label="Close menu"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
        <Sidebar isAdmin={isAdmin} canViewFinance={canViewFinance} navPerms={navPerms} />
      </div>
    </div>
  );
}
