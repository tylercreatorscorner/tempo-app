"use client";
import { useState } from 'react';
import { useInView } from '@/hooks/use-in-view';
import { useTikTokThumbnail } from '@/hooks/use-tiktok-thumbnail';
export function ReportImage({src,kind,name='',videoUrl}:{src?:string|null;kind:'video'|'creator';name?:string;videoUrl?:string|null}) {
 const [failed,setFailed]=useState<string|null>(null);
 const {ref,inView}=useInView<HTMLSpanElement>();
 const stored=src && failed!==src ? src : null;
 const {thumbnail}=useTikTokThumbnail(kind==='video' && inView && !stored ? videoUrl : undefined);
 const source=stored || (thumbnail!==failed ? thumbnail : null);
 return <span ref={ref} className={kind==='video'?'grid h-14 w-10 shrink-0 place-items-center overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 text-xs text-zinc-500':'grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-zinc-200 bg-violet-50 text-xs font-semibold text-violet-700'}>
 {/* Public media URLs; native lazy images tolerate expired external assets. */}
 {/* eslint-disable-next-line @next/next/no-img-element */}
 {source ? <img src={source} alt="" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(source)} className="h-full w-full object-cover"/> : kind==='video'? <span aria-label="Thumbnail unavailable">▶</span> : name.slice(0,1).toUpperCase()}
 </span>;
}
