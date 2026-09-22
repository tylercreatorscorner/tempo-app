'use client';
import {useEffect,useState,useRef} from 'react';
import {Button} from '@/components/ui/button';
import {Popover, Dialog} from 'radix-ui';
import {ChevronDown, Tags, X} from 'lucide-react';
import {SearchInput} from '@/components/ui/search-input';
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
  const [creatorSearch,setCreatorSearch]=useState('');
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
  return <section className="flex items-center gap-1" aria-label="Creator groups">
    <Popover.Root><Popover.Trigger asChild><Button variant="outline" size="sm" aria-label="Filter by creator tags"><Tags className="h-3.5 w-3.5"/>Tags{selected.length>0 ? ` (${selected.length})` : ''}<ChevronDown className="h-3 w-3"/></Button></Popover.Trigger>
      <Popover.Portal><Popover.Content align="start" sideOffset={8} className="z-50 w-64 rounded-xl border border-border bg-card p-3 shadow-xl" data-lenis-prevent>
        <p className="mb-2 text-xs font-semibold">Creator tags</p>
        <div className="max-h-60 space-y-1 overflow-auto">{tags.map(t=><label key={t} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-secondary"><input type="checkbox" checked={selected.includes(t)} onChange={()=>onFilter(selected.includes(t)?selected.filter(v=>v!==t):[...selected,t],mode)}/><span className="capitalize">{t}</span></label>)}</div>
        {!tags.length && <p className="py-2 text-xs text-muted-foreground">No tags assigned to this brand yet.</p>}
        {selected.length>0 && <div className="mt-2 flex items-center justify-between border-t border-border pt-2"><select aria-label="Match creator tags" className="bg-card text-xs" value={mode} onChange={e=>onFilter(selected,e.target.value as 'any'|'all')}><option value="any">Match any</option><option value="all">Match all</option></select><button className="text-xs text-primary" onClick={()=>onFilter([],mode)}>Clear</button></div>}
      </Popover.Content></Popover.Portal>
    </Popover.Root>
    {canWrite && <Dialog.Root open={open} onOpenChange={v=>{if(!busy)setOpen(v);}}><Dialog.Trigger asChild><Button variant="ghost" size="sm">Edit tags</Button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"/><Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl border border-border bg-card p-5 shadow-2xl" data-lenis-prevent>
      <div className="mb-2 flex items-center justify-between"><Dialog.Title className="text-lg font-semibold">Edit creator tags</Dialog.Title><Dialog.Close asChild><button disabled={busy} aria-label="Close tag editor" className="rounded-lg p-2 hover:bg-secondary"><X size={16}/></button></Dialog.Close></div>
      <Dialog.Description className="mb-4 text-xs text-muted-foreground">Choose creators from the current page, then add or remove a tag for this brand.</Dialog.Description>
      <SearchInput aria-label="Find creators on this page" placeholder="Find creators on this page" value={creatorSearch} onChange={e=>setCreatorSearch(e.target.value)} onClear={()=>setCreatorSearch('')} className="mb-3 sm:w-full"/>
      <fieldset disabled={busy||loading}>
        <div className="mb-2 flex gap-3 text-xs"><button type="button" onClick={()=>setIds(eligible.map(r=>Number(r.id)))}>Select this page ({eligible.length})</button><button type="button" onClick={()=>setIds([])}>Clear selection</button></div>
        <div className="grid max-h-60 grid-cols-1 gap-1 overflow-y-auto">{eligible.filter(r=>(r.real_name || String(r.id)).toLowerCase().includes(creatorSearch.toLowerCase())).map(r=><label key={r.id} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-secondary"><input type="checkbox" checked={ids.includes(Number(r.id))} onChange={e=>setIds(e.target.checked?[...ids,Number(r.id)]:ids.filter(id=>id!==Number(r.id)))}/><span className="truncate">{r.real_name || `Creator ${r.id}`}</span></label>)}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><Input aria-label="Tag name" list="creator-tag-options" placeholder="Elite, skincare, September launch…" maxLength={40} value={tag} onChange={e=>setTag(e.target.value)} className="max-w-xs"/><datalist id="creator-tag-options">{tags.map(t=><option key={t} value={t}/>)}</datalist><Button size="sm" disabled={!ids.length||!normalizeCreatorTag(tag)} onClick={()=>save('add')}>Add to {ids.length}</Button><Button variant="outline" size="sm" disabled={!ids.length||!normalizeCreatorTag(tag)} onClick={()=>save('remove')}>Remove tag</Button>{busy&&<span role="status" className="text-xs">Saving tags…</span>}</div>
      </fieldset>
      {error&&<p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      {notice&&<p role="status" className="mt-2 text-xs text-muted-foreground">{notice}</p>}
    </Dialog.Content></Dialog.Portal></Dialog.Root>}
    {error&&<p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    {notice&&<p role="status" className="mt-2 text-xs text-muted-foreground">{notice}</p>}
  </section>;
}
