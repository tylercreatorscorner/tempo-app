'use client';

import { cn } from '@/lib/utils';
import Image from 'next/image';

interface TempoLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTagline?: boolean;
  className?: string;
}

const SIZE_CONFIG = {
  sm: { fontSize: 20, circleSize: 16, gap: 1, playScale: 0.4 },
  md: { fontSize: 26, circleSize: 21, gap: 1, playScale: 0.5 },
  lg: { fontSize: 40, circleSize: 32, gap: 2, playScale: 0.8 },
  xl: { fontSize: 56, circleSize: 44, gap: 3, playScale: 1.1 },
};

export function TempoLogo({
  size = 'md',
  showTagline = false,
  className,
}: TempoLogoProps) {
  const config = SIZE_CONFIG[size];
  const showTag = showTagline && (size === 'lg' || size === 'xl');

  return (
    <div className={cn('inline-flex flex-col items-center select-none', className)}>
      <div
        className="inline-flex items-center"
        style={{ gap: `${config.gap}px` }}
      >
        <span
          style={{
            fontSize: `${config.fontSize}px`,
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            color: '#1A1B3A',
          }}
        >
          Temp
        </span>

        <svg
          viewBox="0 0 40 40"
          fill="none"
          style={{
            width: config.circleSize,
            height: config.circleSize,
            flexShrink: 0,
          }}
        >
          <defs>
            <linearGradient id="tempo-logo-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FF4D8D" />
              <stop offset="1" stopColor="#7C5CFC" />
            </linearGradient>
          </defs>
          <circle cx="20" cy="20" r="20" fill="url(#tempo-logo-grad)" />
          <polygon
            points="16,12 16,28 28,20"
            fill="white"
            fillOpacity="0.95"
          />
        </svg>
      </div>

      {showTag && (
        <span
          style={{
            fontSize: `${config.fontSize * 0.22}px`,
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
            fontWeight: 500,
            letterSpacing: '0.14em',
            color: '#9CA3AF',
            textTransform: 'uppercase' as const,
            marginTop: `${config.fontSize * 0.15}px`,
          }}
        >
          Creator Management, Simplified
        </span>
      )}
    </div>
  );
}

export function TempoIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/logo/tempo-icon.svg"
      alt="Tempo"
      width={size}
      height={size}
      className={className}
    />
  );
}
