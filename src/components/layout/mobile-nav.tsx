'use client';

import { X } from 'lucide-react';
import { Sidebar } from './sidebar';

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
  userRole?: 'owner' | 'customer';
}

export function MobileNav({ open, onClose, userRole }: MobileNavProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 left-0 w-64 z-50 animate-slide-in-right">
        <button
          onClick={onClose}
          className="absolute top-4 right-3 p-1.5 rounded-lg hover:bg-white/10 transition-colors z-10"
          aria-label="Close menu"
        >
          <X className="h-4 w-4 text-gray-400" />
        </button>
        <Sidebar userRole={userRole} />
      </div>
    </div>
  );
}
