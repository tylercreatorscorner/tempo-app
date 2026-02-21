'use client';

import { cn } from '@/lib/utils';
import Image from 'next/image';

interface TempoLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTagline?: boolean;
  className?: string;
}

const SIZE_CONFIG = {
  sm: { width: 100, height: 32 },
  md: { width: 130, height: 40 },
  lg: { width: 200, height: 60 },
  xl: { width: 280, height: 85 },
};

export function TempoLogo({
  size = 'md',
  showTagline = false,
  className,
}: TempoLogoProps) {
  const config = SIZE_CONFIG[size];
  const src = showTagline && (size === 'lg' || size === 'xl')
    ? '/logo/tempo-logo-tagline.svg'
    : '/logo/tempo-logo.svg';

  return (
    <div className={cn('inline-flex items-center select-none', className)}>
      <Image
        src={src}
        alt="Tempo"
        width={config.width}
        height={config.height}
        priority
        className="h-auto"
        style={{ width: config.width, height: 'auto' }}
      />
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
