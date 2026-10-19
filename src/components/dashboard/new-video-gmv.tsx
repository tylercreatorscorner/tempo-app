'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Video } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrencyExact as money } from '@/lib/utils/format';
import type { NewVideoGmv } from '@/lib/data/new-video-gmv';
import { validVideoRange } from '@/lib/data/new-video-gmv';

interface Props { brand?: string | null; range?: string; start?: string | null; end?: string | null; showCreators?: boolean }
export function NewVideoGmvCard({brand,range='custom',start,end,showCreators=false}:Props) {
  const [postStart,setPostStart] = useState('');
  const [postEnd,setPostEnd] = useState('');
  const [posting,setPosting] = useState<{start:string;end:string}|null>(null);
  const invalid = Boolean(postStart || postEnd) && !validVideoRange(postStart,postEnd);
  const params = new URLSearchParams({range});
  if (brand && brand!=='all') params.set('brand',brand);
  if (start) params.set('start',start);
  if (end) params.set('end',end);
  if (posting) { params.set('postStart',posting.start); params.set('postEnd',posting.end); }
  const url = '/api/new-video-gmv?'+params;
  // Remount on filter changes so an old selection never appears under new filters.
  return <section className="space-y-3" aria-label="Video GMV and posting dates">
    <form className="flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();if (!invalid && postStart && postEnd) setPosting({start:postStart,end:postEnd});}}>
      <label className="text-xs text-muted-foreground">Videos posted from (optional)<input type="date" value={postStart} onChange={e=>setPostStart(e.target.value)} className="mt-1 block rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"/></label>
      <label className="text-xs text-muted-foreground">Videos posted through<input type="date" value={postEnd} onChange={e=>setPostEnd(e.target.value)} className="mt-1 block rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"/></label>
      <Button type="submit" size="sm" variant="outline" disabled={invalid || !postStart || !postEnd}>Apply posting dates</Button>
      {(postStart || postEnd || posting) && <Button type="button" size="sm" variant="ghost" onClick={()=>{setPostStart('');setPostEnd('');setPosting(null);}}>Clear</Button>}
      {invalid && <p role="status" className="w-full text-xs text-muted-foreground">Choose both posting dates in order, up to 400 days apart.</p>}
    </form>
    <VideoGmvContent key={url} url={url} showCreators={showCreators} posting={posting}/>
  </section>;
}
function VideoGmvContent({url,showCreators,posting}:{url:string;showCreators:boolean;posting:{start:string;end:string}|null}) {
  const [data,setData] = useState<NewVideoGmv|null>(null);
  const [failed,setFailed] = useState(false);
  const [attempt,setAttempt] = useState(0);
  const [search,setSearch] = useState('');
  const [limit,setLimit] = useState(20);
  useEffect(()=>{
    const controller = new AbortController();
    fetch(url,{signal:controller.signal}).then(async res=>{
      if (!res.ok) throw new Error('Video metrics unavailable');
      const result = await res.json() as NewVideoGmv;
      if (!controller.signal.aborted) setData(result);
    }).catch(()=>{if (!controller.signal.aborted) setFailed(true);});
    return ()=>controller.abort();
  },[url,attempt]);
  const share = data && data.totalGmv>0 ? data.gmv30d/data.totalGmv*100 : null;
  const creators = data?.creators.filter(c=>(c.name+' '+c.brandName).toLowerCase().includes(search.toLowerCase())) ?? [];
  const title = posting ? 'Video GMV by posting date' : 'Video GMV';
  return <Card aria-label={title}>
    <CardHeader><CardTitle><span className="inline-flex items-center gap-2"><Video size={16} aria-hidden="true"/>{title}</span></CardTitle><span className="text-xs text-muted-foreground">Managed creators · {posting ? 'Custom posting dates' : 'All posting dates'}</span></CardHeader>
    <CardContent>
      <p className="mb-4 max-w-3xl text-xs leading-relaxed text-muted-foreground">{posting ? `GMV earned in the selected period from videos posted ${posting.start} through ${posting.end}, including both dates.` : 'GMV earned in the selected period from all managed videos, regardless of when they were posted. Apply posting dates above to narrow the results.'} Excludes live and product-card sales.</p>
      {!data && !failed && <p role="status" className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden="true"/>Loading video GMV…</p>}
      {failed && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm"><span>Video GMV couldn’t be loaded.</span><Button variant="outline" size="sm" onClick={()=>{setFailed(false);setAttempt(n=>n+1);}}>Retry</Button></div>}
      {data && <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">{title}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{data.factCount ? money(data.gmv30d) : '—'}</p></div>
          <div><p className="text-xs text-muted-foreground">Share of managed video GMV</p><p className="mt-1 text-2xl font-semibold tabular-nums">{share===null ? '—' : share.toFixed(1)+'%'}</p></div>
          <div><p className="text-xs text-muted-foreground">{posting ? 'Matching videos' : 'Videos'} with recorded sales data</p><p className="mt-1 text-2xl font-semibold tabular-nums">{data.factCount ? data.videos30d.toLocaleString('en-US') : '—'}</p></div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">{data.start} – {data.end} · {data.brands} {data.brands===1?'brand':'brands'} · {money(data.totalGmv)} recorded managed video GMV</p>
        {!data.factCount && <p className="mt-2 text-sm text-muted-foreground">No managed video data recorded for this selection.</p>}
        {data.recordedBrandDays<data.expectedBrandDays && <p className="mt-2 text-xs text-muted-foreground">Managed video data is recorded for {data.recordedBrandDays} of {data.expectedBrandDays} brand-days. Totals reflect available records; days without records may have no activity or missing uploads.</p>}
        {data.unknownPostDateGmv!==0 && <p className="mt-2 text-xs text-muted-foreground">{money(data.unknownPostDateGmv)} has no video post date and is {posting ? 'excluded from this posting-date selection' : 'included because no posting-date filter is applied'}.</p>}
        {showCreators && data.creators.length>0 && <details className="mt-4 border-t border-border pt-3">
          <summary className="cursor-pointer text-sm font-medium">View by creator <span className="text-muted-foreground">({data.creators.length} creator-brand entries)</span></summary>
          <p className="mt-2 text-xs text-muted-foreground">All managed creators with video data for these brands and dates. Independent of the roster’s search, tags, and health filters.</p>
          <input aria-label="Search video GMV creators" value={search} onChange={e=>{setSearch(e.target.value);setLimit(20);}} placeholder="Search creator or brand…" className="my-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm sm:max-w-sm"/>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="py-2 font-medium">Creator</th><th className="px-3 py-2 font-medium">Brand</th><th className="px-3 py-2 text-right font-medium">{posting ? "Selected video GMV" : "Video GMV"}</th><th className="py-2 text-right font-medium">Video GMV share</th></tr></thead><tbody>
            {creators.slice(0,limit).map(c=><tr key={c.id} className="border-t border-border"><td className="py-3">{c.creatorId ? <Link className="font-medium hover:underline" href={'/creators/'+encodeURIComponent(c.creatorId)+'?brand='+encodeURIComponent(c.brand)}>{c.name}</Link> : c.name}</td><td className="px-3 py-3 text-muted-foreground">{c.brandName}</td><td className="px-3 py-3 text-right tabular-nums">{money(c.gmv30d)}</td><td className="py-3 text-right tabular-nums">{c.totalGmv>0 ? (c.gmv30d/c.totalGmv*100).toFixed(1)+'%' : '—'}</td></tr>)}
          </tbody></table></div>
          {creators.length===0 && <p className="py-3 text-sm text-muted-foreground">No matching creators.</p>}
          {creators.length>limit && <Button className="mt-3" size="sm" variant="outline" onClick={()=>setLimit(n=>n+20)}>Show more creators</Button>}
        </details>}
      </>}
    </CardContent>
  </Card>;
}

