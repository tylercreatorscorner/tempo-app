'use client';
import { useState } from 'react';
export function BrandPortrait({ name, source, color, size = 30 }: { name: string; source?: string | null; color?: string | null; size?: number }) {
  // Replace only the known legacy wordmark; future customer uploads take precedence.
  const avatarSource = source === 'https://elrsgxlyejlkzjcnhmak.supabase.co/storage/v1/object/public/brand-logos/b0000000-0000-0000-0000-000000000002/30876f2564134a41.png'
    ? '/brand-marks/physicians-choice.jpg'
    : source;
  const [failed, setFailed] = useState<string | null>(null);
  const rgb = color && /^#[0-9a-f]{6}$/i.test(color) ? [1,3,5].map(start => parseInt(color.slice(start,start+2),16)) : null;
  const ink = rgb ? (rgb[0]*.299 + rgb[1]*.587 + rgb[2]*.114 > 155 ? '#18181b' : '#fff') : 'var(--foreground)';
  const style = { width:size,height:size,borderRadius:9,border:'none',flexShrink:0,background:color || 'var(--secondary)' };
  // Stored brand artwork only; never substitute an unrelated third-party image.
  // eslint-disable-next-line @next/next/no-img-element
  if(avatarSource && failed !== avatarSource) return <img src={avatarSource} alt="" referrerPolicy="no-referrer" onError={()=>setFailed(avatarSource)} style={{...style,objectFit:'contain',padding:0}} />;
  return <span aria-hidden="true" style={{...style,display:'inline-grid',placeItems:'center',color:ink,fontSize:11,fontWeight:600}}>{name.split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase()}</span>;
}



