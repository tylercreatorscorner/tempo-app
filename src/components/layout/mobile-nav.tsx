'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sidebar } from './sidebar';

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
  isAdmin?: boolean;
  canViewFinance?: boolean;
}

/**
 * Below-lg slide-out nav. Always mounted so it animates BOTH in and out
 * (transform + backdrop-opacity transitions); a left-anchored drawer slides
 * from the left (-translate-x-full → 0), and taps/pointer events pass through
 * when closed. Escape closes it.
 */
export function MobileNav({ open, onClose, isAdmin = false, canViewFinance = true }: MobileNavProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className={cn('fixed inset-0 z-50 lg:hidden', !open && 'pointer-events-none')} aria-hidden={!open}>
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
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-3 z-10 rounded-lg p-1.5 transition-colors hover:bg-muted"
          aria-label="Close menu"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
        <Sidebar isAdmin={isAdmin} canViewFinance={canViewFinance} />
      </div>
    </div>
  );
}
