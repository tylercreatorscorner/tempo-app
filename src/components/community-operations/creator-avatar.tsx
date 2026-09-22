'use client';

import { useState } from 'react';

export function CreatorAvatar({ channelId, name, authorId, large = false }: { channelId: string; name: string; authorId?: string; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const initials = name.trim().split(/[\s_.-]+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase() || '?';
  return <span aria-hidden="true" className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 font-semibold text-primary ring-1 ring-border ${large ? 'h-11 w-11 text-sm' : 'h-9 w-9 text-xs'}`}>
    {initials}
    {/* Authenticated ticket lookup resolves to the creator's Discord CDN avatar. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {!failed && <img src={`/api/community-operations/avatar?channel=${channelId}${authorId?`&author=${authorId}`:''}`} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" onError={() => setFailed(true)} />}
  </span>;
}
