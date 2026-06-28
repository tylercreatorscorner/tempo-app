'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Eye, Check } from 'lucide-react';
import { switchManager } from '@/app/actions/switch-manager';

interface Manager { id: string; name: string; }
interface Props { managers: Manager[]; activeManagerId: string | null; }

/** Platform-admin "view as" dropdown — mirrors the tenant switcher. Selecting a
 *  manager re-renders the whole app as that member's (read-only) view. */
export function ManagerSwitcher({ managers, activeManagerId }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = managers.find((m) => m.id === activeManagerId) ?? null;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current?.contains(e.target as Node)) return; setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  async function select(id: string | null) {
    setPending(true);
    setOpen(false);
    await switchManager(id);
    setPending(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={pending}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors text-xs font-medium disabled:opacity-50 ${
          active ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100' : 'border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700'
        }`}
      >
        <Eye className="h-3.5 w-3.5" />
        <span className="max-w-[130px] truncate">{active ? `Viewing: ${active.name}` : 'View as…'}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-60 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50 max-h-80 overflow-y-auto">
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Super Admin — View As (read-only)</p>
          </div>
          <button onClick={() => select(null)} className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            <span className="font-medium">Yourself (full access)</span>
            {!activeManagerId && <Check className="h-3.5 w-3.5 text-purple-600" />}
          </button>
          {managers.map((m) => (
            <button key={m.id} onClick={() => select(m.id)} className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
              <span className="font-medium truncate text-left min-w-0">{m.name}</span>
              {activeManagerId === m.id && <Check className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />}
            </button>
          ))}
          {managers.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No managers in this tenant.</p>}
        </div>
      )}
    </div>
  );
}
