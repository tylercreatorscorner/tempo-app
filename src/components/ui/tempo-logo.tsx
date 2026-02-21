'use client';

import { cn } from '@/lib/utils';
import { useId } from 'react';

interface TempoLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
  showTagline?: boolean;
  className?: string;
}

const SIZE_CONFIG = {
  sm: { fontSize: 20, circleSize: 13, gap: -1 },
  md: { fontSize: 26, circleSize: 17, gap: -1 },
  lg: { fontSize: 40, circleSize: 26, gap: -1 },
  xl: { fontSize: 56, circleSize: 36, gap: -2 },
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
        className="inline-flex items-baseline transition-transform duration-300 ease-out group-hover:scale-[1.03] cursor-default"
        style={{ gap: 0 }}
      >
        {/* "Temp" as a single span — no letter splitting */}
        <span
          className={animated ? 'animate-tempo-text' : undefined}
          style={{
            fontSize: `${config.fontSize}px`,
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            color: '#1A1B3A',
          }}
        >
          Temp
        </span>

        {/* O circle with play triangle */}
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
            marginLeft: `${config.gap}px`,
            marginBottom: `${config.fontSize * 0.02}px`,
            alignSelf: 'baseline',
          }}
        >
          {/* Pulsing glow ring */}
          <circle
            cx="20"
            cy="20"
            r="19"
            fill="none"
            stroke={`url(#${glowId})`}
            strokeWidth="2.5"
            className="animate-tempo-glow"
          />
          {/* Main gradient circle */}
          <circle cx="20" cy="20" r="20" fill={`url(#${gradId})`} />
          {/* Play triangle — optically centered (shifted right ~1px for visual balance) */}
          <polygon
            points="17,12 17,28 29.5,20"
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

      {/* Tagline */}
      {showTag && (
        <span
          className={animated ? 'animate-tempo-tag' : undefined}
          style={{
            fontSize: `${config.fontSize * 0.28}px`,
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            fontWeight: 500,
            letterSpacing: '0.12em',
            color: '#9CA3AF',
            textTransform: 'uppercase',
            marginTop: `${config.fontSize * 0.18}px`,
          }}
        >
          Creator Management, Simplified
        </span>
      )}
    </div>
  );
}
