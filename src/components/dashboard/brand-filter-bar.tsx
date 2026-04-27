'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BRAND_COLORS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import { createClient } from '@/lib/supabase/client';

interface BrandItem {
  key: string;
  label: string;
}

export function BrandFilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get('brand') || 'all';
  const [brands, setBrands] = useState<BrandItem[]>([]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      // Filter brands by the current user's allowed_brands (if restricted)
      const { data: { user } } = await supabase.auth.getUser();
      let allowedBrands: string[] | null = null;
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

      let query = supabase
        .from('brands_v2')
        .select('slug, display_name, name')
        .eq('is_archived', false);
      if (allowedBrands) query = query.in('slug', allowedBrands);
      const { data } = await query.order('name');
      if (data) {
        setBrands(data.map(b => ({
          key: b.slug,
          label: b.display_name || BRAND_DISPLAY_NAMES[b.slug] || b.name,
        })));
      }
    }
    load();
  }, []);

  const allBrands: BrandItem[] = [{ key: 'all', label: 'All Brands' }, ...brands];

  function select(brand: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (brand === 'all') {
      params.delete('brand');
    } else {
      params.set('brand', brand);
    }
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {allBrands.map((b) => {
        const isActive = current === b.key;
        const color = BRAND_COLORS[b.key];
        const isAll = b.key === 'all';

        return (
          <button
            key={b.key}
            onClick={() => select(b.key)}
            className={cn(
              'px-4 py-1.5 text-sm rounded-full font-medium transition-all duration-300 border cursor-pointer hover:scale-[1.05]',
              isActive && isAll && 'bg-gray-900 border-gray-900 text-white shadow-md',
              !isActive && isAll && 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-900',
              isActive && !isAll && 'text-white shadow-md',
              !isActive && !isAll && 'bg-white border-gray-200 text-gray-500 hover:text-gray-900',
            )}
            style={
              isActive && !isAll && color
                ? { backgroundColor: color, borderColor: color }
                : !isActive && !isAll && color
                ? { borderColor: `${color}40` }
                : undefined
            }
          >
            {!isAll && color && (
              <span
                className="inline-block w-2 h-2 rounded-full mr-2"
                style={{ backgroundColor: isActive ? '#fff' : color }}
              />
            )}
            {b.label}
          </button>
        );
      })}
    </div>
  );
}
