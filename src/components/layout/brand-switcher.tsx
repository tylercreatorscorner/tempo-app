'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
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
  const [options, setOptions] = useState<BrandOption[]>([{ key: 'all', label: 'All Brands', color: null }]);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  // Load brands from database
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from('brands_v2')
        .select('slug, display_name, name, color')
        .order('name');
      if (data) {
        setOptions([
          { key: 'all', label: 'All Brands', color: null },
          ...data.map(b => ({
            key: b.slug,
            label: b.display_name || BRAND_DISPLAY_NAMES[b.slug] || b.name,
            color: b.color || BRAND_COLORS[b.slug] || '#6B7280',
          })),
        ]);
      }
    }
    load();
  }, []);

  // Position dropdown below button
  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, []);

  useEffect(() => {
    if (open) updatePos();
  }, [open, updatePos]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        btnRef.current?.contains(e.target as Node) ||
        dropRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const dropdown = open && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={dropRef}
          className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 animate-fade-in"
          style={{ top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
        >
          {options.map((opt) => {
            const isActive = brand === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => { setBrand(opt.key); setOpen(false); }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                  isActive ? 'bg-pink-50 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                {opt.color ? (
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} />
                ) : (
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-gradient-to-br from-pink-400 via-purple-400 to-blue-400" />
                )}
                <span className="flex-1 text-left">{opt.label}</span>
                {isActive && <Check className="h-3.5 w-3.5 text-[#FF4D8D]" />}
              </button>
            );
          })}
        </div>,
        document.body
      )
    : null;

  return (
    <div className="px-3">
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
          'border hover:shadow-sm',
          brand === 'all'
            ? 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
            : 'bg-white border-gray-200 text-gray-900 hover:bg-gray-50'
        )}
      >
        {brandColor ? (
          <span
            className="w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-white shadow-sm"
            style={{ backgroundColor: brandColor }}
          />
        ) : (
          <span className="w-3 h-3 rounded-full flex-shrink-0 bg-gradient-to-br from-pink-400 via-purple-400 to-blue-400 ring-2 ring-white shadow-sm" />
        )}
        <span className="flex-1 text-left truncate">{brandLabel}</span>
        <ChevronDown className={cn('h-4 w-4 text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>
      {dropdown}
    </div>
  );
}
