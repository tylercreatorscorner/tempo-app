'use client';

import { useState } from 'react';
import { Eye, X } from 'lucide-react';
import { switchManager } from '@/app/actions/switch-manager';

/** Prominent "you are impersonating" banner with an exit button. Read-only is
 *  enforced server-side (middleware); this makes the mode unmistakable. */
export function ViewAsBanner({ name }: { name: string }) {
  const [pending, setPending] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-500/10 px-4 py-2 text-sm">
      <span className="inline-flex items-center gap-2 font-medium text-foreground">
        <Eye className="h-4 w-4 flex-shrink-0" />
        Viewing as <span className="font-bold">{name}</span> — read-only preview
      </span>
      <button
        onClick={async () => { setPending(true); await switchManager(null); setPending(false); }}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition-colors flex-shrink-0"
      >
        <X className="h-3.5 w-3.5" /> Exit
      </button>
    </div>
  );
}
