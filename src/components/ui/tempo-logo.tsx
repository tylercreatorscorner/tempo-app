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
  sm: { height: 24, fontSize: 24, circleSize: 22, gap: 2 },
  md: { height: 32, fontSize: 32, circleSize: 29, gap: 3 },
  lg: { height: 48, fontSize: 48, circleSize: 44, gap: 4 },
  xl: { height: 64, fontSize: 64, circleSize: 58, gap: 5 },
};

export function TempoLogo({
  size = 'md',
  animated = true,
  showTagline = false,
  className,
}: TempoLogoProps) {
  const gradId = useId();
  const config = SIZE_CONFIG[size];
  const letters = ['T', 'e', 'm', 'p'];
  const showTag = showTagline && (size === 'lg' || size === 'xl');

  return (
    <div
      className={cn('tempo-logo-root inline-flex flex-col items-center select-none', className)}
    >
      <style>{`
        .tempo-logo-root {
          --logo-transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .tempo-logo-root:hover .tempo-logo-inner {
          transform: scale(1.03);
        }
        .tempo-logo-root:hover .tempo-o-svg {
          filter: drop-shadow(0 4px 20px rgba(255, 77, 141, 0.45)) drop-shadow(0 2px 8px rgba(124, 92, 252, 0.3));
        }
        .tempo-logo-inner {
          transition: transform var(--logo-transition);
        }
        .tempo-o-svg {
          transition: filter var(--logo-transition);
        }
        @keyframes tempoLetterIn {
          from { opacity: 0; transform: translateY(0.4em); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes tempoOIn {
          from { opacity: 0; transform: scale(0) rotate(-180deg); }
          to { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @keyframes tempoGlow {
          0%, 100% { opacity: 0; }
          50% { opacity: 0.2; }
        }
        @keyframes tempoTagIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .tempo-letter-anim {
          opacity: 0;
          animation: tempoLetterIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .tempo-o-anim {
          opacity: 0;
          animation: tempoOIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .tempo-tag-anim {
          opacity: 0;
          animation: tempoTagIn 0.4s ease forwards;
        }
        .tempo-glow-ring {
          animation: tempoGlow 3s ease-in-out infinite;
        }
      `}</style>

      <div
        className="tempo-logo-inner inline-flex items-center cursor-default"
        style={{ gap: `${config.gap}px` }}
      >
        {letters.map((letter, i) => (
          <span
            key={letter}
            className={animated ? 'tempo-letter-anim' : undefined}
            style={{
              fontSize: `${config.fontSize}px`,
              fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
              fontWeight: 800,
              letterSpacing: '-0.03em',
              lineHeight: 1,
              color: '#1A1B3A',
              display: 'inline-block',
              ...(animated ? { animationDelay: `${i * 50}ms` } : {}),
            }}
          >
            {letter}
          </span>
        ))}

        {/* O circle with play triangle */}
        <svg
          viewBox="0 0 40 40"
          fill="none"
          className={cn('tempo-o-svg', animated && 'tempo-o-anim')}
          style={{
            width: config.circleSize,
            height: config.circleSize,
            flexShrink: 0,
            marginLeft: `${config.gap}px`,
            ...(animated ? { animationDelay: '200ms' } : {}),
          }}
        >
          {/* Glow ring */}
          <circle
            cx="20"
            cy="20"
            r="19"
            fill="none"
            stroke="url(#glow)"
            strokeWidth="3"
            className="tempo-glow-ring"
          />
          {/* Main circle */}
          <circle cx="20" cy="20" r="20" fill={`url(#${gradId})`} />
          {/* Play triangle — optically centered (shifted right ~1.5px) */}
          <polygon
            points="16.5,11 16.5,29 30,20"
            fill="white"
            fillOpacity="0.95"
          />
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FF4D8D" />
              <stop offset="1" stopColor="#7C5CFC" />
            </linearGradient>
            <linearGradient id="glow" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FF4D8D" />
              <stop offset="1" stopColor="#7C5CFC" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {showTag && (
        <span
          className={animated ? 'tempo-tag-anim' : undefined}
          style={{
            fontSize: `${config.fontSize * 0.35}px`,
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
            fontWeight: 500,
            letterSpacing: '0.15em',
            color: '#9CA3AF',
            textTransform: 'uppercase',
            marginTop: `${config.fontSize * 0.2}px`,
            ...(animated ? { animationDelay: '500ms' } : {}),
          }}
        >
          Creator Management, Simplified
        </span>
      )}
    </div>
  );
}
