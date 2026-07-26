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

/** The Beat mark, in the 40×40 viewBox shared by every rendering of the logo.
 *  Bars sit on a common baseline at y = 30.5, and the cluster is centred both
 *  ways (9.25 → 30.75, 9.5 → 30.5).
 *
 *  These numbers were chosen against rasterised proofs at every size the mark
 *  actually ships at — 16 (favicon), 21 (sidebar), 26 (collapsed rail), 28 (OG
 *  card), 32, 44. The shortest bar is 10 tall rather than 8 because at 16px an
 *  8-tall bar is shorter than its own corner radius and degenerates into a dot;
 *  the 5.5 width holds the 2.5 gaps open at that size instead of letting the
 *  three bars fuse. Re-run scripts/../rasterize-mark.mjs before changing them. */
const BAR_WIDTH = 5.5;
const BARS = [
  { x: 9.25, y: 20.5, h: 10 },
  { x: 17.25, y: 15, h: 15.5 },
  { x: 25.25, y: 9.5, h: 21 },
];

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
            color: 'var(--foreground)',
          }}
        >
          Temp
        </span>

        <svg
          viewBox="0 0 40 40"
          fill="none"
          className={cn(
            'transition-[filter] duration-300 group-hover:drop-shadow-[0_4px_16px_rgba(75,69,255,0.45)]',
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
          {/* Three ascending bars on a shared baseline (y = 30): a waveform and
              a bar chart at once. Geometry is identical in icon.svg, the OG
              card and public/logo/* — change it in all four or not at all. */}
          {BARS.map((bar, i) => (
            <rect
              key={bar.x}
              x={bar.x}
              y={bar.y}
              width={BAR_WIDTH}
              height={bar.h}
              rx={BAR_WIDTH / 2}
              fill="white"
              fillOpacity="0.97"
              className={animated ? 'animate-tempo-bar' : undefined}
              style={animated ? { animationDelay: `${0.28 + i * 0.07}s` } : undefined}
            />
          ))}
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
              <stop stopColor="var(--primary)" />
              <stop offset="1" stopColor="var(--pulse-accent-2)" />
            </linearGradient>
            <linearGradient id={glowId} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
              <stop stopColor="var(--primary)" />
              <stop offset="1" stopColor="var(--pulse-accent-2)" />
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
            color: 'var(--muted-foreground)',
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
