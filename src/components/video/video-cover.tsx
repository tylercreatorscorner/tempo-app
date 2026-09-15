'use client';
import { useState } from 'react';
import { Play } from 'lucide-react';
import { useInView } from '@/hooks/use-in-view';
import { useTikTokThumbnail } from '@/hooks/use-tiktok-thumbnail';
import { useVideoPanel, type VideoData } from './video-panel-context';
export function VideoCover({ video, stored }: { video:VideoData; stored?:string|null }) {
  const {ref,inView}=useInView<HTMLButtonElement>();
  const [failed,setFailed]=useState<string|null>(null);
  const storedWorks=stored && failed!==stored;
  const fallback=inView && !storedWorks;
  const {thumbnail,loading}=useTikTokThumbnail(undefined,fallback?{creatorName:video.creator_name,videoId:video.video_id}:undefined);
  const source=storedWorks?stored:thumbnail && failed!==thumbnail?thumbnail:null;
  const {openVideo}=useVideoPanel();
  return <button ref={ref} type="button" aria-label={`Review video: ${video.video_title || 'Untitled'}`} onClick={()=>openVideo(video)} className="relative block aspect-[9/12] w-full overflow-hidden rounded-xl bg-secondary text-muted-foreground border border-border">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {source && <img src={source} alt="" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(source)} className="absolute inset-0 h-full w-full object-cover"/>}
    <span className="absolute inset-0 flex items-center justify-center"><span className="rounded-full bg-black/50 p-2 text-white"><Play size={16}/></span></span>
    {!source && <span className="absolute bottom-2 inset-x-1 text-center text-[9px]">{loading?'Loading cover…':'Preview unavailable'}</span>}
  </button>;
}
