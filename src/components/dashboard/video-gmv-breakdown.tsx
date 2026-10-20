'use client';
import {useEffect,useState} from 'react';
import {Loader2,ExternalLink} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {formatCurrencyExact as money} from '@/lib/utils/format';
import type {VideoGmvBreakdown as Breakdown} from '@/lib/data/new-video-gmv';
import mobile from './video-gmv-breakdown.module.css';

export function VideoGmvBreakdown({url}:{url:string}) {
  const [offset,setOffset]=useState(0);
  return <VideoPage key={url+'&offset='+offset} url={url+'&offset='+offset} offset={offset} onPage={setOffset}/>;
}
function VideoPage({url,offset,onPage}:{url:string;offset:number;onPage:(offset:number)=>void}) {
  const [data,setData]=useState<Breakdown|null>(null);
  const [failed,setFailed]=useState(false);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    fetch(url,{signal:controller.signal}).then(async response=>{
      if(!response.ok) throw new Error('Video breakdown unavailable');
      const result=await response.json() as Breakdown;
      if(!controller.signal.aborted) setData(result);
    }).catch(()=>{if(!controller.signal.aborted) setFailed(true);});
    return ()=>controller.abort();
  },[url,attempt]);
  if(failed) return <div role="alert" className="flex items-center gap-3 py-4 text-sm">Videos couldn’t be loaded.<Button size="sm" variant="outline" onClick={()=>{setFailed(false);setAttempt(n=>n+1);}}>Retry videos</Button></div>;
  if(!data) return <p role="status" className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden="true"/>Loading videos…</p>;
  return <div className="mt-4 border-t border-border pt-4">
    <h4 className="text-sm font-semibold">Videos driving this GMV</h4>
    <p className="my-2 text-xs text-muted-foreground">{money(data.totalGmv)} across {data.totalRows.toLocaleString()} video-brand entries, highest GMV first. Sales across products and days are combined per video and brand.</p>
    {data.totalRows===0 ? <p className="py-4 text-sm text-muted-foreground">No videos match these earning and posting dates.</p> : <>
      <div className={`${mobile.region} overflow-x-auto`}><table role="table" className={`${mobile.table} w-full text-left text-sm`}><caption className="sr-only">Videos ranked by GMV for the selected earning and posting dates</caption><thead className="text-xs text-muted-foreground"><tr><th className="py-2 font-medium">Video / Creator</th><th className="px-3 py-2 font-medium">Brand</th><th className="px-3 py-2 font-medium">Posted</th><th className="px-3 py-2 text-right font-medium">GMV</th><th className="py-2 text-right font-medium">Share of selection</th></tr></thead><tbody>
        {data.videos.map(v=>{
          const handle=v.handle?.replace(/^@/,'').trim();
          const href=v.videoId && /^\d+$/.test(v.videoId) && handle ? 'https://www.tiktok.com/@'+encodeURIComponent(handle)+'/video/'+encodeURIComponent(v.videoId) : null;
          const title=v.title || (v.videoId ? 'Video '+v.videoId : 'Video ID unavailable');
          return <tr key={v.brand+':'+(v.videoId ?? 'missing:'+v.handle)} className="border-t border-border">
            <td className="max-w-sm py-3"><div className="break-words font-medium">{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">{title} <ExternalLink size={12} className="inline" aria-hidden="true"/><span className="sr-only"> (opens TikTok in a new tab)</span></a> : title}</div><p className="mt-1 text-xs text-muted-foreground">{v.creator}{handle ? ' · @'+handle : ''}</p></td>
            <td data-label="Brand" className="px-3 py-3">{v.brandName}</td><td data-label="Posted" className="whitespace-nowrap px-3 py-3">{v.postDate ?? 'Unknown'}</td><td data-label="Video GMV" className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{money(v.gmv)}</td><td data-label="Share of selection" className="py-3 text-right tabular-nums">{data.totalGmv>0 ? (v.gmv/data.totalGmv*100).toFixed(1)+'%' : '—'}</td>
          </tr>;
        })}
      </tbody></table></div>
      <div className="mt-3 flex flex-wrap items-center gap-3"><Button size="sm" variant="outline" disabled={offset===0} onClick={()=>onPage(Math.max(0,offset-50))}>Previous videos</Button><span className="text-xs text-muted-foreground">{Math.min(offset+1,data.totalRows)}–{Math.min(offset+data.videos.length,data.totalRows)} of {data.totalRows}</span><Button size="sm" variant="outline" disabled={offset+50>=data.totalRows} onClick={()=>onPage(offset+50)}>Next videos</Button></div>
    </>}
  </div>;
}
