'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGlobalBrand } from '@/hooks/use-global-brand';
import { BRAND_DISPLAY_NAMES, BRAND_COLORS } from '@/lib/utils/constants';
import { createClient } from '@/lib/supabase/client';

interface BrandOption {
  key: string;
  label: string;
  color: string | null;
}

export function BrandSwitcher() {
  const { brand, setBrand, brandLabel, brandColor } = useGlobalBrand();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<BrandOption[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from('brands_v2')
        .select('slug, display_name, name, color')
        .order('name');
      if (data && data.length > 0) {
        setOptions([
          ...(data.length > 1 ? [{ key: 'all', label: 'All Brands', color: null as string | null }] : []),
          ...data.map(b => ({
            key: b.slug,
            label: b.display_name || BRAND_DISPLAY_NAMES[b.slug] || b.name,
            color: b.color || BRAND_COLORS[b.slug] || '#6B7280',
          })),
        ]);
        if (data.length === 1) setBrand(data[0].slug);
      }
    }
    load();
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (options.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      {/* Dropdown — opens upward */}
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1.5 bg-white border border-gray-200 rounded-xl shadow-xl shadow-black/10 py-1.5 z-50 animate-fade-in">
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 select-none">
            Switch Brand
          </p>
          {options.map((opt) => {
            const isActive = brand === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => { setBrand(opt.key); setOpen(false); }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-pink-50 text-gray-900 font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                {opt.color ? (
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm" style={{ backgroundColor: opt.color }} />
                ) : (
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-gradient-to-br from-pink-400 via-purple-400 to-blue-400" />
                )}
                <span className="flex-1 text-left truncate">{opt.label}</span>
                {isActive && <Check className="h-3.5 w-3.5 text-[#FF4D8D] flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
          'border hover:shadow-sm',
          open
            ? 'bg-gray-50 border-gray-300 text-gray-900'
            : brand === 'all'
            ? 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
            : 'bg-white border-gray-200 text-gray-900 hover:bg-gray-50'
        )}
      >
        {brandColor ? (
          <span className="w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-white shadow-sm" style={{ backgroundColor: brandColor }} />
        ) : (
          <Building2 className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
        )}
        <span className="flex-1 text-left truncate">{brandLabel}</span>
        <ChevronDown className={cn('h-4 w-4 text-gray-400 transition-transform duration-200', open && 'rotate-180')} />
      </button>
    </div>
  );
}
