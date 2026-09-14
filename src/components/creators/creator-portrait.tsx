'use client';

import { useState } from 'react';

interface PortraitProps {
  creatorId?: string | null;
  source?: string | null;
  name: string;
  className?: string;
}

/** Shared roster/profile identity. The repair endpoint authorizes every request. */
export function CreatorPortrait(props: PortraitProps) {
  return <PortraitSource key={`${props.creatorId ?? ''}|${props.source ?? ''}`} {...props} />;
}

function PortraitSource({ creatorId, source, name, className }: PortraitProps) {
  const original = source || null;
  const repair = creatorId ? `/api/creators/${creatorId}/avatar` : null;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const src = failedSource === null ? (original || repair) : failedSource === original ? repair : null;
  if (src && failedSource !== src) {
    // Decorative: the adjacent creator name already provides the accessible identity.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedSource(src)} className={className} />;
  }
  const initials = name.trim().split(/\s+/).filter(word => /^[A-Za-z0-9]/.test(word)).slice(0, 2).map(word => word[0].toUpperCase()).join('');
  return <span aria-hidden="true" className={className}>{initials || '?'}</span>;
}
