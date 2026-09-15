'use client';
import { useState } from 'react';
export function BrandPortrait({ name, source, size = 30 }: { name: string; source?: string | null; size?: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  const style = { width:size,height:size,borderRadius:9,border:'1px solid var(--border)',flexShrink:0 };
  // Stored brand artwork only; never substitute an unrelated third-party image.
  // eslint-disable-next-line @next/next/no-img-element
  if(source && failed !== source) return <img src={source} alt="" referrerPolicy="no-referrer" onError={()=>setFailed(source)} style={{...style,objectFit:'contain',background:'#e5e5ed',padding:2,filter:'drop-shadow(0 0 0.5px #777582)'}} />;
  return <span aria-hidden="true" style={{...style,display:'inline-grid',placeItems:'center',background:'var(--secondary)',color:'var(--primary)',fontSize:11,fontWeight:600}}>{name.split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase()}</span>;
}


