'use client';
import { useState } from 'react';
import { Play } from 'lucide-react';
import { useInView } from '@/hooks/use-in-view';
import { isCanonicalVideoUrl } from '@/lib/utils/format';

function CoverImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  // TikTok no longer includes thumbnail_url in oEmbed. The authenticated
  // same-origin resolver supplies validated image bytes instead of an expiring URL.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />;
}

export function VideoThumbnail({ url, className = '' }: { url: string; className?: string }) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  const src = isCanonicalVideoUrl(url) ? `/api/dashboard/video-cover?${new URLSearchParams({ url })}` : null;
  return <span ref={ref} className={`relative flex h-12 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary text-muted-foreground ${className}`}>
    <Play size={14} aria-hidden="true" />
    {inView && src && <CoverImage key={src} src={src} />}
  </span>;
}
