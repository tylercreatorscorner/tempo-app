'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface BrandSwitcherProps {
  brands: string[];
  currentBrand: string | null; // null = "All Brands"
}

export function BrandSwitcher({ brands, currentBrand }: BrandSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

  const displayLabel = currentBrand ?? 'All Brands';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm text-foreground hover:bg-muted transition-colors"
      >
        <span className="font-medium">{displayLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 w-48 bg-card border border-border rounded-xl shadow-lg z-50 py-1">
          <button
            onClick={() => switchBrand(null)}
            className={`w-full text-left px-4 py-2 text-sm hover:bg-muted ${!currentBrand ? 'text-[var(--primary)] font-medium' : 'text-foreground'}`}
          >
            All Brands
          </button>
          {brands.map((b) => (
            <button
              key={b}
              onClick={() => switchBrand(b)}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-muted ${currentBrand === b ? 'text-[var(--primary)] font-medium' : 'text-foreground'}`}
            >
              {b}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
