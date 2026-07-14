'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Building2, Check, Eye } from 'lucide-react';
import { switchTenant } from '@/app/actions/switch-tenant';
import { switchManager } from '@/app/actions/switch-manager';

interface Tenant { id: string; name: string; plan: string; }
interface Manager { id: string; name: string; }

interface Props {
  tenants: Tenant[];
  activeTenantId: string | null;
  managers: Manager[];
  activeManagerId: string | null;
}

/** Single platform-admin context control: switch tenant, and (within a tenant)
 *  "view as" a manager — read-only. One pill + one menu (sectioned). */
export function TenantSwitcher({ tenants, activeTenantId, managers, activeManagerId }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // After changing tenant / view-as, re-sync the page (server components) and
  // notify client widgets that self-fetch by scope (e.g. the brand selector).
  function syncContext() {
    window.dispatchEvent(new Event('workspace-context-changed'));
    router.refresh();
  }

  const activeTenant = tenants.find((t) => t.id === activeTenantId) ?? null;
  const activeManager = managers.find((m) => m.id === activeManagerId) ?? null;

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  async function pickTenant(id: string | null) {
    setPending(true); setOpen(false);
    await switchTenant(id);
    syncContext();
    setPending(false);
  }
  async function pickManager(id: string | null) {
    setPending(true); setOpen(false);
    await switchManager(id);
    syncContext();
    setPending(false);
  }

  const label = activeManager
    ? `${activeTenant?.name ?? 'Tenant'} · as ${activeManager.name}`
    : (activeTenant?.name ?? 'All Tenants');

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={pending}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors text-xs font-medium disabled:opacity-50 ${
          activeManager
            ? 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800'
            : 'border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700'
        }`}
      >
        {activeManager ? <Eye className="h-3.5 w-3.5 flex-shrink-0" /> : <Building2 className="h-3.5 w-3.5 flex-shrink-0" />}
        <span className="max-w-[180px] truncate">{label}</span>
        <ChevronDown className="h-3 w-3 opacity-60 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-64 bg-card border border-border rounded-xl shadow-lg z-50">
          <div data-lenis-prevent className="max-h-[70vh] overflow-y-auto overscroll-contain py-1">
            {/* Tenant section */}
            <div className="px-3 py-2 border-b border-border">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Super Admin — Switch Tenant</p>
            </div>
            <button onClick={() => pickTenant(null)} className="w-full flex items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors">
              <span className="font-medium">All Tenants</span>
              {!activeTenantId && <Check className="h-3.5 w-3.5 text-purple-600" />}
            </button>
            {tenants.map((t) => (
              <button key={t.id} onClick={() => pickTenant(t.id)} className="w-full flex items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors">
                <div className="text-left min-w-0">
                  <p className="font-medium truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{t.plan}</p>
                </div>
                {activeTenantId === t.id && <Check className="h-3.5 w-3.5 text-purple-600 flex-shrink-0" />}
              </button>
            ))}

            {/* View-as section — only within a specific tenant */}
            {activeTenantId && (
              <>
                <div className="px-3 py-2 border-y border-border mt-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">View As (read-only)</p>
                </div>
                <button onClick={() => pickManager(null)} className="w-full flex items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors">
                  <span className="font-medium">Yourself (full access)</span>
                  {!activeManagerId && <Check className="h-3.5 w-3.5 text-purple-600" />}
                </button>
                {managers.map((m) => (
                  <button key={m.id} onClick={() => pickManager(m.id)} className="w-full flex items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors">
                    <span className="font-medium truncate text-left min-w-0">{m.name}</span>
                    {activeManagerId === m.id && <Check className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />}
                  </button>
                ))}
                {managers.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No managers in this tenant.</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
