'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';

/**
 * Renders a real product screenshot if `screenshot` is provided, otherwise
 * falls back to the animated SVG mockup. Drop PNGs into /public/screenshots/
 * and reference them via the `screenshot` field in landing-content.ts.
 */
export function ProductMockup({
  screenshot,
  alt,
  fallback,
  priority,
}: {
  screenshot?: string;
  alt: string;
  fallback: ReactNode;
  priority?: boolean;
}) {
  if (!screenshot) return <>{fallback}</>;

  return (
    <div className="relative">
      {/* Soft glow */}
      <div className="absolute -inset-6 bg-gradient-to-br from-[#FF4D8D]/10 to-[#7C5CFC]/10 rounded-3xl blur-3xl -z-10" />

      <div className="relative rounded-2xl overflow-hidden bg-white border border-[#E5E7EB] shadow-2xl shadow-[#7C5CFC]/10">
        <Image
          src={screenshot}
          alt={alt}
          width={2400}
          height={1500}
          priority={priority}
          quality={92}
          className="w-full h-auto"
        />
      </div>
    </div>
  );
}
