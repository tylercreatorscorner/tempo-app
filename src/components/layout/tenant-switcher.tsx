'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Building2, Check } from 'lucide-react';
import { switchTenant } from '@/app/actions/switch-tenant';

interface Tenant {
  id: string;
  name: string;
  plan: string;
}

interface TenantSwitcherProps {
  tenants: Tenant[];
  activeTenantId: string | null;
}

export function TenantSwitcher({ tenants, activeTenantId }: TenantSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = tenants.find(t => t.id === activeTenantId) ?? null;

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  async function select(id: string | null) {
    setPending(true);
    setOpen(false);
    await switchTenant(id);
    setPending(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={pending}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 transition-colors text-xs font-medium text-purple-700 disabled:opacity-50"
      >
        <Building2 className="h-3.5 w-3.5" />
        <span className="max-w-[120px] truncate">{active?.name ?? 'All Tenants'}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50">
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Super Admin — Switch Tenant</p>
          </div>
          <button
            onClick={() => select(null)}
            className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span className="font-medium">All Tenants</span>
            {!activeTenantId && <Check className="h-3.5 w-3.5 text-purple-600" />}
          </button>
          {tenants.map(t => (
            <button
              key={t.id}
              onClick={() => select(t.id)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <div className="text-left min-w-0">
                <p className="font-medium truncate">{t.name}</p>
                <p className="text-xs text-gray-400 capitalize">{t.plan}</p>
              </div>
              {activeTenantId === t.id && <Check className="h-3.5 w-3.5 text-purple-600 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
