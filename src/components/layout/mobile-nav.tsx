'use client';

import { X } from 'lucide-react';
import { Sidebar } from './sidebar';

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

/** Mobile navigation overlay */
export function MobileNav({ open, onClose }: MobileNavProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="fixed inset-y-0 left-0 w-64 z-50">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded hover:bg-sidebar-accent z-10"
          aria-label="Close menu"
        >
          <X className="h-5 w-5 text-sidebar-foreground" />
        </button>
        <Sidebar />
      </div>
    </div>
  );
}
