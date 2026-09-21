'use client';
import {useEffect,useState,useRef} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {normalizeCreatorTag} from '@/lib/roster/creator-tags';

type Row={id:string;real_name:string|null;is_managed:boolean;brand:string|null};
export function CreatorGroupControls({brand,rows,selected,mode,onFilter,onSaved,loading}:{brand:string;rows:Row[];selected:string[];mode:'any'|'all';onFilter:(tags:string[],mode:'any'|'all')=>void;onSaved:()=>void;loading:boolean}) {
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
  const [tags,setTags]=useState<string[]>([]);
  const [canWrite,setCanWrite]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [open,setOpen]=useState(false);
  const [ids,setIds]=useState<number[]>([]);
  const [tag,setTag]=useState('');
  const [busy,setBusy]=useState(false);
  const [version,setVersion]=useState(0);
  const eligible=rows.filter(r=>r.is_managed && r.brand===brand && Number.isSafeInteger(Number(r.id)));
  const pageKey=eligible.map(r=>r.id).join(',');
  useEffect(()=>{setIds([]);},[pageKey]);
  useEffect(()=>{
    let ignore=false;
    fetch(`/api/roster/tags?brand=${encodeURIComponent(brand)}`).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error);if(!ignore){setTags(j.tags);setCanWrite(j.canWrite);}}).catch(()=>{if(!ignore){setCanWrite(false);setError('Could not load creator tags.');}});
    return ()=>{ignore=true;};
  },[brand,version]);
  async function save(action:'add'|'remove') {
    setBusy(true);setError('');setNotice('');
    try {
      const response=await fetch('/api/roster/tags',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({brand,ids,tag,action})});
      const result=await response.json();
      if(!mounted.current)return;
      if(result.updated?.length){setNotice(`${result.updated.length} creator${result.updated.length===1?'':'s'} updated.`);onSaved();setVersion(v=>v+1);}
      if(!response.ok)throw new Error(result.error || 'Could not update tags.');
      setIds([]);setTag('');
    } catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Could not update tags.');}
    finally{if(mounted.current)setBusy(false);}
  }
  return <section className="mb-3 rounded-xl border border-border bg-card px-4 py-3" aria-label="Creator groups">
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold">Creator tags</span>
      {tags.map(t=><button key={t} type="button" aria-pressed={selected.includes(t)} onClick={()=>onFilter(selected.includes(t)?selected.filter(v=>v!==t):[...selected,t],mode)} className={`rounded-full border px-2.5 py-1 text-xs capitalize ${selected.includes(t)?'border-primary bg-primary/10 text-primary':'border-border text-muted-foreground hover:text-foreground'}`}>{t}</button>)}
      {!tags.length && <span className="text-xs text-muted-foreground">No tags assigned yet</span>}
      {selected.length>0 && <><select aria-label="Match creator tags" className="rounded-md border border-border bg-background px-2 py-1 text-xs" value={mode} onChange={e=>onFilter(selected,e.target.value as 'any'|'all')}><option value="any">Match any</option><option value="all">Match all</option></select><button className="text-xs text-muted-foreground" onClick={()=>onFilter([],mode)}>Clear</button></>}
      {canWrite && <Button variant="ghost" size="sm" className="ml-auto" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>Manage tags</Button>}
    </div>
    {open && canWrite && <div className="mt-3 border-t border-border pt-3">
      <p className="mb-2 text-xs text-muted-foreground">Select creators on this page. Tags belong only to this brand. Discord syncing is not enabled yet.</p>
      <fieldset disabled={busy||loading}>
        <div className="mb-2 flex gap-3 text-xs"><button type="button" onClick={()=>setIds(eligible.map(r=>Number(r.id)))}>Select this page ({eligible.length})</button><button type="button" onClick={()=>setIds([])}>Clear selection</button></div>
        <div className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-3">{eligible.map(r=><label key={r.id} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-secondary"><input type="checkbox" checked={ids.includes(Number(r.id))} onChange={e=>setIds(e.target.checked?[...ids,Number(r.id)]:ids.filter(id=>id!==Number(r.id)))}/><span className="truncate">{r.real_name || `Creator ${r.id}`}</span></label>)}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><Input aria-label="Tag name" list="creator-tag-options" placeholder="Elite, skincare, September launch…" maxLength={40} value={tag} onChange={e=>setTag(e.target.value)} className="max-w-xs"/><datalist id="creator-tag-options">{tags.map(t=><option key={t} value={t}/>)}</datalist><Button size="sm" disabled={!ids.length||!normalizeCreatorTag(tag)} onClick={()=>save('add')}>Add to {ids.length}</Button><Button variant="outline" size="sm" disabled={!ids.length||!normalizeCreatorTag(tag)} onClick={()=>save('remove')}>Remove tag</Button>{busy&&<span role="status" className="text-xs">Saving tags…</span>}</div>
      </fieldset>
    </div>}
    {error&&<p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    {notice&&<p role="status" className="mt-2 text-xs text-muted-foreground">{notice}</p>}
  </section>;
}
