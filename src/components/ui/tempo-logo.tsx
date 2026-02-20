'use client';

import { cn } from '@/lib/utils';

interface TempoLogoProps {
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  className?: string;
}

const SIZE_MAP = {
  sm: { fontSize: '1.25rem', svgSize: 24, gap: '0.15rem' },
  md: { fontSize: '1.75rem', svgSize: 34, gap: '0.2rem' },
  lg: { fontSize: '2.5rem', svgSize: 48, gap: '0.25rem' },
};

export function TempoLogo({ size = 'md', animated = true, className }: TempoLogoProps) {
  const { fontSize, svgSize, gap } = SIZE_MAP[size];
  const letters = ['T', 'e', 'm', 'p'];

  return (
    <div
      className={cn('tempo-logo-wrapper group inline-flex items-center cursor-default select-none', className)}
      style={{ gap, transition: 'transform 0.3s ease' }}
    >
      <style>{`
        .tempo-logo-wrapper:hover {
          transform: scale(1.05);
        }
        .tempo-logo-wrapper:hover .tempo-o-circle {
          transform: scale(1.1);
          filter: drop-shadow(0 4px 16px rgba(255, 77, 141, 0.5));
        }
        @keyframes tempoLetterIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes tempoOIn {
          from { opacity: 0; transform: scale(0) rotate(-180deg); }
          to { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @keyframes tempoGlow {
          0%, 100% { filter: drop-shadow(0 0 6px rgba(255, 77, 141, 0.3)); }
          50% { filter: drop-shadow(0 0 14px rgba(255, 77, 141, 0.6)); }
        }
        .tempo-letter-animated {
          opacity: 0;
          animation: tempoLetterIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .tempo-o-animated {
          opacity: 0;
          animation: tempoOIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          animation-delay: 0.35s;
        }
        .tempo-o-circle {
          transition: transform 0.3s ease, filter 0.3s ease;
          animation: tempoGlow 3s ease-in-out infinite;
        }
      `}</style>
      {letters.map((letter, i) => (
        <span
          key={i}
          className={animated ? 'tempo-letter-animated' : ''}
          style={{
            fontSize,
            fontWeight: 800,
            letterSpacing: '-1.5px',
            lineHeight: 1,
            color: '#1A1B3A',
            animationDelay: animated ? `${i * 0.07}s` : undefined,
          }}
        >
          {letter}
        </span>
      ))}
      <svg
        viewBox="0 0 40 40"
        fill="none"
        className={cn('tempo-o-circle', animated && 'tempo-o-animated')}
        style={{
          width: svgSize,
          height: svgSize,
          marginLeft: gap,
          flexShrink: 0,
        }}
      >
        <circle cx="20" cy="20" r="20" fill="url(#tempoLogoGrad)" />
        <path
          d="M16 11.5a0.8 0.8 0 011.2-.7l12.6 7.8a0.8 0.8 0 010 1.4L17.2 27.8a0.8 0.8 0 01-1.2-.7V11.5z"
          fill="white"
          fillOpacity="0.95"
        />
        <defs>
          <linearGradient id="tempoLogoGrad" x1="0" y1="0" x2="40" y2="40">
            <stop stopColor="#FF4D8D" />
            <stop offset="1" stopColor="#7C5CFC" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
