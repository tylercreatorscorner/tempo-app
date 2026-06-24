'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ChevronsUpDown, Check, Search, LayoutGrid, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useGlobalBrand } from '@/hooks/use-global-brand';
import { createClient } from '@/lib/supabase/client';

interface BrandOption {
  key: string;
  label: string;
  color: string | null;
}

/** 1–2 letter initials for a brand avatar (skips emoji / punctuation). */
function initials(label: string): string {
  const words = label.replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Pick a readable initials color for a brand-color background — dark on light
 * fills (Lemme yellow, light greens), white on dark. Relative-luminance test. */
function readableText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#1A1B3A' : '#ffffff';
}

/** Brand avatar — colored rounded square with initials, or a grid tile for "All Brands". */
function BrandAvatar({ color, label, size = 'md' }: { color: string | null; label: string; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'h-6 w-6 text-[9px] rounded-md' : 'h-7 w-7 text-[10px] rounded-lg';
  if (!color) {
    return (
      <span className={cn(dim, 'flex items-center justify-center bg-gradient-to-br from-[#FF4D8D] via-[#A855F7] to-[#3B82F6] text-white shadow-sm flex-shrink-0')}>
        <LayoutGrid className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      </span>
    );
  }
  return (
    <span
      className={cn(dim, 'flex items-center justify-center font-bold shadow-sm flex-shrink-0')}
      style={{ backgroundColor: color, color: readableText(color) }}
    >
      {initials(label)}
    </span>
  );
}

export function BrandSwitcher() {
  const { brand, setBrand, brandLabel, brandColor } = useGlobalBrand();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [options, setOptions] = useState<BrandOption[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load the brand list. Resilient by design: any failure (a transient network
  // blip, a session that resolved a beat late, a stale cached bundle) lands in
  // an 'error' state that the trigger ignores and the dropdown lets you retry —
  // it must NEVER leave the switcher blank. That's why the component renders the
  // trigger regardless of whether this succeeds, and why we don't swallow errors.
  const loadBrands = useCallback(async () => {
    const supabase = createClient();
    setStatus(s => (s === 'ready' ? s : 'loading'));

    // Per-user brand restriction (allowed_brands) is best-effort: if the auth or
    // profile lookup hiccups, fall back to no extra client filter and let RLS
    // scope the list — never abort the whole load over it.
    let allowedBrands: string[] | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('allowed_brands')
          .eq('user_id', user.id)
          .maybeSingle();
        if (Array.isArray(profile?.allowed_brands) && profile.allowed_brands.length > 0) {
          allowedBrands = profile.allowed_brands;
        }
      }
    } catch (e) {
      console.warn('[BrandSwitcher] allowed_brands lookup failed; relying on RLS', e);
    }

    // Hide LeeFar's per-store slugs from the picker. Roster + management
    // is keyed to the 'leefar' umbrella; per-store splits live inside the
    // performance views (videos/posts), not as top-level brand entries.
    const HIDDEN_STORE_SLUGS = ['leefar_nutrition', 'leefar_supplements', 'leefar_us'];

    let req = supabase
      .from('brands_v2')
      .select('slug, display_name, name, color')
      .eq('is_archived', false)
      .not('slug', 'in', `(${HIDDEN_STORE_SLUGS.map(s => `"${s}"`).join(',')})`);
    if (allowedBrands) req = req.in('slug', allowedBrands);

    const { data, error } = await req.order('name');
    if (error) {
      // Surface it — don't swallow. The dropdown shows a Retry affordance.
      console.error('[BrandSwitcher] failed to load brands:', error.message);
      setStatus('error');
      return;
    }

    const rows = data ?? [];
    setOptions([
      ...(rows.length > 1 ? [{ key: 'all', label: 'All Brands', color: null as string | null }] : []),
      ...rows.map(b => ({
        key: b.slug,
        label: b.display_name || b.name,
        color: b.color || '#6B7280',
      })),
    ]);
    setStatus('ready');
    if (rows.length === 1) setBrand(rows[0].slug);
  }, [setBrand]);

  useEffect(() => { loadBrands(); }, [loadBrands]);

  // Self-heal: if the menu is opened after a failed load, try again so the user
  // isn't stuck with an empty list.
  useEffect(() => {
    if (open && status === 'error') loadBrands();
  }, [open, status, loadBrands]);

  // Filter by name or slug as the user types.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.label.toLowerCase().includes(q) || o.key.toLowerCase().includes(q));
  }, [options, query]);

  // Reset search + focus the input each time the menu opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  // Keep the highlight on the first match whenever the filter changes.
  useEffect(() => { setActiveIndex(0); }, [query]);

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

  // Keep the highlighted row scrolled into view during keyboard nav.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, query]);

  function choose(opt: BrandOption) {
    setBrand(opt.key);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[activeIndex]) choose(filtered[activeIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  // NOTE: intentionally NOT returning null on an empty list. The trigger always
  // renders (it only needs the global brand), so the switcher can never vanish;
  // the dropdown handles the loading / failed / empty states inline.

  return (
    <div ref={containerRef} className="relative">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-gray-200/80 rounded-2xl shadow-2xl shadow-black/10 overflow-hidden z-50"
          >
            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
              <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search brands…"
                role="combobox"
                aria-expanded
                aria-controls="brand-switcher-list"
                className="flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 min-w-0"
              />
              {query && (
                <button
                  onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                  className="text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* List */}
            <div ref={listRef} id="brand-switcher-list" role="listbox" className="max-h-72 overflow-y-auto px-1.5 py-1.5">
              {options.length === 0 ? (
                <div className="px-3 py-8 text-center">
                  {status === 'loading' ? (
                    <p className="text-sm text-gray-400">Loading brands…</p>
                  ) : (
                    <>
                      <p className="text-sm text-gray-400">Couldn&rsquo;t load brands</p>
                      <button
                        onClick={() => loadBrands()}
                        className="mt-2 text-xs font-medium text-[#FF4D8D] hover:underline"
                      >
                        Retry
                      </button>
                    </>
                  )}
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-3 py-8 text-center">
                  <p className="text-sm text-gray-400">No brands match</p>
                  <p className="text-xs text-gray-300 mt-0.5 truncate">&ldquo;{query}&rdquo;</p>
                </div>
              ) : (
                filtered.map((opt, i) => {
                  const isActive = brand === opt.key;
                  const isHighlighted = i === activeIndex;
                  return (
                    <button
                      key={opt.key}
                      data-idx={i}
                      role="option"
                      aria-selected={isActive}
                      onMouseMove={() => setActiveIndex(i)}
                      onClick={() => choose(opt)}
                      className={cn(
                        'w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm transition-colors',
                        isHighlighted ? 'bg-gray-100/80' : 'bg-transparent',
                      )}
                    >
                      <BrandAvatar color={opt.color} label={opt.label} />
                      <span className={cn('flex-1 text-left truncate', isActive ? 'font-semibold text-gray-900' : 'text-gray-700')}>
                        {opt.label}
                      </span>
                      {isActive && <Check className="h-4 w-4 text-[#FF4D8D] flex-shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer hint */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 bg-gray-50/50">
              <span className="text-[10px] text-gray-400">
                {filtered.length} brand{filtered.length === 1 ? '' : 's'}
              </span>
              <span className="text-[10px] text-gray-300 hidden sm:flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-white border border-gray-200 text-gray-400 font-sans text-[9px]">↑↓</kbd>
                <kbd className="px-1 py-0.5 rounded bg-white border border-gray-200 text-gray-400 font-sans text-[9px]">↵</kbd>
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 border',
          open
            ? 'bg-gray-50 border-gray-300 shadow-sm'
            : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300',
        )}
      >
        <BrandAvatar color={brand === 'all' ? null : brandColor} label={brandLabel} size="sm" />
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[9px] uppercase tracking-wider text-gray-400 leading-none mb-0.5">Brand</p>
          <p className="text-sm text-gray-900 truncate leading-none font-semibold">{brandLabel}</p>
        </div>
        <ChevronsUpDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
      </button>
    </div>
  );
}
