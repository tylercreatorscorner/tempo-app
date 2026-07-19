'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronsUpDown, Check, Building2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface BrandSwitcherProps {
  brands: string[];
  currentBrand: string | null; // null = "All Brands"
}

function prettyLabel(slug: string | null): string {
  if (!slug) return 'All Brands';
  return slug.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Creator brand switcher — pinned at the sidebar bottom (matches the admin/brand
 * shell), so its dropdown opens UPWARD. Full-width trigger + kit styling.
 */
export function BrandSwitcher({ brands, currentBrand }: BrandSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const switchBrand = async (brand: string | null) => {
    setOpen(false);
    await fetch('/api/auth/creator/switch-brand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand }),
    });
    router.refresh();
  };

  if (brands.length <= 1) return null;

  const options: (string | null)[] = [null, ...brands];

  return (
    <div ref={ref} className="relative">
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1.5 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-card py-1.5 shadow-xl shadow-black/10 z-50 animate-fade-in">
          <p className="select-none px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Switch brand
          </p>
          {options.map((b) => {
            const active = b === currentBrand;
            return (
              <button
                key={b ?? '__all'}
                onClick={() => switchBrand(b)}
                disabled={active}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
                  active
                    ? 'cursor-default bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <span className="flex-1 truncate">{prettyLabel(b)}</span>
                {active && <Check className="h-3.5 w-3.5 flex-shrink-0 text-[var(--primary)]" />}
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all',
          open ? 'border-border bg-muted' : 'border-border bg-card hover:bg-muted',
        )}
      >
        <Building2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 text-left">
          <p className="text-[9px] uppercase leading-none tracking-wider text-muted-foreground">Brand</p>
          <p className="truncate text-sm font-semibold text-foreground">{prettyLabel(currentBrand)}</p>
        </div>
        <ChevronsUpDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      </button>
    </div>
  );
}
