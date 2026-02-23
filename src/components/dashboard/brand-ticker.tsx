'use client';

import { formatCurrency, formatPercent } from '@/lib/utils/format';
import { BRAND_COLORS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';

interface BrandTickerData {
  brand: string;
  gmv: number;
  trend: number | undefined;
}

interface Props {
  brands: BrandTickerData[];
}

export function BrandTicker({ brands }: Props) {
  if (brands.length === 0) return null;

  return (
    <div className="relative rounded-xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-1 px-4 py-2 bg-gray-50/50 border-b border-gray-100">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Live Portfolio</span>
      </div>
      
      <div className="relative overflow-hidden">
        <div className="flex animate-scroll-ticker py-3">
          {/* Duplicate the brands to create seamless loop */}
          {[...brands, ...brands].map((brand, index) => (
            <div key={index} className="flex items-center gap-2 px-6 whitespace-nowrap border-r border-gray-100 last:border-r-0">
              <div 
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: BRAND_COLORS[brand.brand] ?? '#6B7280' }}
              />
              <span className="font-bold text-gray-800 uppercase text-sm tracking-wider">
                {brand.brand === 'physicians_choice' ? 'PC' : 
                 brand.brand === 'catakor' ? 'CATA' : 
                 brand.brand.toUpperCase()}
              </span>
              <span className="font-bold text-gray-900">{formatCurrency(brand.gmv)}</span>
              {brand.trend !== undefined && (
                <span className={`flex items-center gap-1 text-sm font-semibold ${
                  brand.trend >= 0 ? 'text-green-600' : 'text-red-500'
                }`}>
                  <span>{brand.trend >= 0 ? '▲' : '▼'}</span>
                  <span>{formatPercent(Math.abs(brand.trend))}</span>
                </span>
              )}
              <span className="text-gray-300 text-lg font-light">•</span>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes scroll-ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-scroll-ticker {
          animation: scroll-ticker 30s linear infinite;
        }
        .animate-scroll-ticker:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}