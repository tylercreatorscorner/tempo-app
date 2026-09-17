'use client';
import { useState } from 'react';
import { Play } from 'lucide-react';
import { useInView } from '@/hooks/use-in-view';
import { useTikTokThumbnail } from '@/hooks/use-tiktok-thumbnail';

export function VideoThumbnail({ url }: { url: string }) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  const { thumbnail } = useTikTokThumbnail(inView ? url : undefined);
  const [failed, setFailed] = useState(false);
  return <span ref={ref} className="relative flex h-12 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary text-muted-foreground">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {thumbnail && !failed ? <img src={thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover"/> : <Play size={14} aria-hidden="true"/>}
  </span>;
}
