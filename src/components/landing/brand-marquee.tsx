'use client';

import { Marquee } from '@/components/ui/marquee';
import { LANDING_CONTENT } from '@/lib/landing-content';

export function BrandMarquee() {
  const brands = LANDING_CONTENT.marqueeBrands;

  return (
    <div className="relative py-14 border-y border-tempo-line/60 overflow-hidden bg-white">
      <p className="text-center text-[11px] font-semibold text-[#C4C9D4] uppercase tracking-[0.18em] mb-8">
        {LANDING_CONTENT.marqueeLabel}
      </p>
      <Marquee pauseOnHover className="[--duration:38s] [--gap:3.5rem]">
        {brands.map((b) => (
          <BrandPill key={b.name} name={b.name} color={b.color} />
        ))}
      </Marquee>

      {/* Edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-white to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-white to-transparent" />
    </div>
  );
}

function BrandPill({ name, color }: { name: string; color: string }) {
  return (
    <div className="flex items-center gap-3 flex-shrink-0">
      <div className="w-5 h-5 rounded-md" style={{ backgroundColor: color, opacity: 0.55 }} />
      <span
        className="text-base font-semibold tracking-tight whitespace-nowrap"
        style={{ color: 'rgba(26, 27, 58, 0.32)' }}
      >
        {name}
      </span>
    </div>
  );
}
