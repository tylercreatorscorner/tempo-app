'use client';
import { useState } from 'react';
export function BrandPortrait({ name, source, color, size = 30 }: { name: string; source?: string | null; color?: string | null; size?: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  const rgb = color && /^#[0-9a-f]{6}$/i.test(color) ? [1,3,5].map(start => parseInt(color.slice(start,start+2),16)) : null;
  const ink = rgb ? (rgb[0]*.299 + rgb[1]*.587 + rgb[2]*.114 > 155 ? '#18181b' : '#fff') : 'var(--foreground)';
  const style = { width:size,height:size,borderRadius:9,border:'none',flexShrink:0,background:color || 'var(--secondary)' };
  // Stored brand artwork only; never substitute an unrelated third-party image.
  // eslint-disable-next-line @next/next/no-img-element
  if(source && failed !== source) return <img src={source} alt="" referrerPolicy="no-referrer" onError={()=>setFailed(source)} style={{...style,objectFit:'cover',padding:0}} />;
  return <span aria-hidden="true" style={{...style,display:'inline-grid',placeItems:'center',color:ink,fontSize:11,fontWeight:600}}>{name.split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase()}</span>;
}



