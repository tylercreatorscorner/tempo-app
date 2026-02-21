'use client';

import { cn } from '@/lib/utils';
import { useId } from 'react';
import Image from 'next/image';

interface TempoLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
  showTagline?: boolean;
  className?: string;
}

const SIZE_CONFIG = {
  sm: { fontSize: 20, circleSize: 16, gap: 1 },
  md: { fontSize: 26, circleSize: 21, gap: 1 },
  lg: { fontSize: 40, circleSize: 32, gap: 2 },
  xl: { fontSize: 56, circleSize: 44, gap: 3 },
};

export function TempoLogo({
  size = 'md',
  animated = true,
  showTagline = false,
  className,
}: TempoLogoProps) {
  const gradId = useId();
  const glowId = `${gradId}-glow`;
  const config = SIZE_CONFIG[size];
  const showTag = showTagline && (size === 'lg' || size === 'xl');

  return (
    <div className={cn('inline-flex flex-col items-center select-none group', className)}>
      <div
        className="inline-flex items-center transition-transform duration-300 ease-out group-hover:scale-[1.03] cursor-default"
        style={{ gap: `${config.gap}px` }}
      >
        <span
          className={animated ? 'animate-tempo-text' : undefined}
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
          className={cn(
            'transition-[filter] duration-300 group-hover:drop-shadow-[0_4px_16px_rgba(255,77,141,0.4)]',
            animated && 'animate-tempo-o'
          )}
          style={{
            width: config.circleSize,
            height: config.circleSize,
            flexShrink: 0,
          }}
        >
          <circle
            cx="20"
            cy="20"
            r="19"
            fill="none"
            stroke={`url(#${glowId})`}
            strokeWidth="2.5"
            className="animate-tempo-glow"
          />
          <circle cx="20" cy="20" r="20" fill={`url(#${gradId})`} />
          <polygon
            points="16,12 16,28 28,20"
            fill="white"
            fillOpacity="0.95"
          />
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FF4D8D" />
              <stop offset="1" stopColor="#7C5CFC" />
            </linearGradient>
            <linearGradient id={glowId} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FF4D8D" />
              <stop offset="1" stopColor="#7C5CFC" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {showTag && (
        <span
          className={animated ? 'animate-tempo-tag' : undefined}
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
