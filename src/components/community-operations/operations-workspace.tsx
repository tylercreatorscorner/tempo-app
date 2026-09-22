'use client';
import { workLane,dailyRank,laneLabels } from '@/lib/community-ops/daily-queue';
import { Dialog } from 'radix-ui';
import { ConversationThread } from './conversation-thread';
import { CreatorAvatar } from './creator-avatar';
import { FilterSelect } from './filter-select';

import { useCallback,useEffect,useState,useRef } from 'react';

import Link from 'next/link';
import { CommunityStudio,type CampaignEdit } from './community-studio';

import { ArrowRight,ExternalLink,RefreshCw,Search,Settings2 } from 'lucide-react';

import { pilotGuilds,opsUrl,type OpsBrand,type OpsChannel,type OpsMessage } from '@/lib/community-ops/model';

const button='inline-flex items-center justify-center gap-2 rounded border border-border px-2.5 py-1.5 text-xs hover:bg-secondary disabled:opacity-50';

const input='w-full rounded border border-border bg-background px-2 py-1.5 text-sm';

const date=(s:string|null|undefined)=>s?new Date(s).toLocaleString(): 'Not observed';

async function read(r:Response){const data=await r.json();if(!r.ok)throw Error(data.error??'Request failed');return data;}

import { followupDue, isEscalated as escalated, nextChannelId } from '@/lib/community-ops/queue-state';

type ReviewEdit={version:string;owner:string;note:string;draft:string;status:OpsChannel['status'];followup:string};



export function OperationsWorkspace({initialView='Today',initialBrand}:{initialView?:string;initialBrand?:string}){
  const [sentFeedback,setSentFeedback]=useState('');
  const [settingsDirty,setSettingsDirty]=useState(false),[settingsNotice,setSettingsNotice]=useState('');
  const settingsTrigger=useRef<HTMLButtonElement>(null);
  const [passed,setPassed]=useState<string[]>([]);
  const [batch,setBatch]=useState<{key:string;ids:string[]}|null>(null);

  const edits=useRef(new Map<string,ReviewEdit>());
  const communityEdits=useRef(new Map<string,CampaignEdit>());

  const [data,setData]=useState<{brands:OpsBrand[];channels:OpsChannel[]}|null>(null),[error,setError]=useState('');

  const [brand,setBrand]=useState(Object.entries(pilotGuilds).find(([id,b])=>id===initialBrand||b.slug===initialBrand)?.[0]??'all'),[mode,setMode]=useState(initialView),[query,setQuery]=useState(''),[selected,setSelected]=useState(''),[settings,setSettings]=useState(false),[scanning,setScanning]=useState(false),[revision,setRevision]=useState(0);

  const load=useCallback(async()=>{try{setData(await read(await fetch('/api/community-operations/queue',{cache:'no-store'})));setError('');}catch(e){setError((e as Error).message);}},[]);

  useEffect(()=>{void load();const t=setInterval(()=>void load(),30000);return()=>clearInterval(t);},[load]);

  const brands=[...(data?.brands??[])].sort((a,b)=>a.name.localeCompare(b.name));const map=new Map(brands.map(b=>[b.guild_id,b]));

  const channels=data?.channels??[];

  const scoped=channels.filter(c=>c.kind==='ticket'&&(brand==='all'||c.guild_id===brand));
  const counts={reply:0,decision:0,team:0,review:0,older:0,waiting:0};
  scoped.forEach(c=>counts[workLane(c)]++);
  const pool=scoped.filter(c=>`${c.name} ${c.metrics?.creator_name??''} ${c.assessment?.issue??''} ${c.owner_label??''}`.toLowerCase().includes(query.toLowerCase())).filter(c=>{
    const lane=workLane(c);
    if(mode==='All conversations')return true;
    if(mode==='Today')return lane==='reply'||lane==='decision'||(followupDue(c)&&!!c.owner_label);
    if(mode==='Ready to reply')return lane==='reply';
    if(mode==='Decisions')return lane==='decision';
    if(mode==='Waiting on team')return lane==='team';
    if(mode==='Needs review')return lane==='review';
    if(mode==='Older conversations')return lane==='older';
    if(mode==='Escalations')return escalated(c,map.get(c.guild_id));
    return false;
  }).sort(dailyRank);
  const batchKey=brand+'|'+query;
  useEffect(()=>setPassed([]),[batchKey]);
  const candidateKey=pool.map(c=>c.channel_id).join(',');
  const queueLoaded=!!data;
  useEffect(()=>{if(mode==='Today'&&queueLoaded)setBatch(previous=>previous?.key===batchKey?previous:{key:batchKey,ids:candidateKey.split(',').filter(Boolean).slice(0,10)});},[mode,queueLoaded,batchKey,candidateKey]);
  const filtered=mode==='Today'?(batch?.key===batchKey?batch.ids.flatMap(id=>{const c=pool.find(row=>row.channel_id===id);return c?[c]:[];}):pool.slice(0,10)):pool;

  const current=selected==='__done__'?undefined:channels.find(c=>c.channel_id===selected)??filtered[0];

  const next=current?nextChannelId(filtered,current.channel_id):null;

  useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(edits.current.size||communityEdits.current.size){e.preventDefault();}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);

  async function scan(){setScanning(true);try{await read(await fetch('/api/community-operations/queue',{method:'POST'}));await load();}catch(e){setError((e as Error).message);}finally{setScanning(false);}}



  return <section className="comms-workspace mx-auto max-w-[1600px] space-y-3 pb-4">

    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3"><div className="flex items-baseline gap-3"><h1 className="text-xl font-semibold">Messages</h1><span className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">{data?(mode==='Community'?'Community drafts':mode==='Today'?`${filtered.length} in this pass`:`${filtered.length} conversations`):'Loading conversations'}</span></div><div className="flex items-center gap-2"><button ref={settingsTrigger} className={button} onClick={()=>setSettings(true)}><Settings2 size={14}/>Workflow settings</button><button className={button} disabled={scanning} onClick={()=>void scan()}><RefreshCw size={14}/>{scanning?'Syncing...':'Sync'}</button></div></header>
    {sentFeedback&&<p role="status" className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{sentFeedback}</p>}
    {error&&<p role="alert" className="border-l-2 border-amber-500 px-3 py-2 text-sm">{error}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border"><nav className="flex gap-5" aria-label="Message views">{[['Today','Inbox'],['Community','Community posts']].map(([v,label])=>{const chosen=v==='Today'?mode!=='Community':mode===v;return <button key={v} onClick={()=>{setMode(v);setSelected('');const url=new URL(window.location.href);url.pathname='/messages';if(v==='Today')url.searchParams.delete('view');else url.searchParams.set('view',v==='Community'?'community':'history');window.history.replaceState(null,'',url);}} aria-current={chosen?'page':undefined} className={`border-b-2 px-0.5 py-2.5 text-sm ${chosen?'border-primary font-semibold text-primary':'border-transparent text-muted-foreground hover:text-foreground'}`}>{label}</button>;})}</nav><div className="flex items-center gap-2 pb-1"><label className="text-xs text-muted-foreground" htmlFor="comms-brand">Brand</label><FilterSelect id="comms-brand"  value={brand} onValueChange={value=>{setBrand(value);setSelected('');const url=new URL(window.location.href);if(value==='all')url.searchParams.delete('brand');else url.searchParams.set('brand',pilotGuilds[value as keyof typeof pilotGuilds]?.slug??value);window.history.replaceState(null,'',url);}}><option value="all">All seven brands</option>{brands.map(b=><option key={b.guild_id} value={b.guild_id}>{b.name}</option>)}</FilterSelect>{mode!=='Community'&&<FilterSelect aria-label="Inbox filter"  value={mode} onValueChange={value=>{setMode(value);setSelected('');}}><option value="Today">Next 10</option><option value="Ready to reply">Replies ({counts.reply})</option><option value="Decisions">Decisions ({counts.decision})</option><option value="Waiting on team">Team follow-through ({counts.team})</option><option value="Needs review">Check context ({counts.review})</option><option value="Older conversations">Older work ({counts.older})</option><option value="All conversations">All conversations ({scoped.length})</option></FilterSelect>}</div></div>
    {mode!=='Community'&&<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">{mode==='Today'&&<button className="font-medium text-primary underline" onClick={()=>{const seen=new Set([...passed,...(batch?.key===batchKey?batch.ids:[])]);const remaining=pool.filter(c=>!seen.has(c.channel_id));setPassed(remaining.length?[...seen]:[]);setBatch({key:batchKey,ids:(remaining.length?remaining:pool).map(c=>c.channel_id).slice(0,10)});setSelected('');}}>{pool.some(c=>![...passed,...(batch?.key===batchKey?batch.ids:[])].includes(c.channel_id))?'Next pass':'Restart remaining work'}</button>}<span>{mode==='Today'?`${pool.length} action candidates; this pass keeps its original order. Review before acting.`:'Work is grouped by the next action, not unread status.'}</span><button className="underline" onClick={()=>{setMode('Waiting on team');setSelected('');}}>Team {counts.team}</button><button className="underline" onClick={()=>{setMode('Needs review');setSelected('');}}>Check context {counts.review}</button><button className="underline" onClick={()=>{setMode('Older conversations');setSelected('');}}>Older {counts.older}</button></div>}
    <Dialog.Root open={settings} onOpenChange={open=>{if(!open&&settingsDirty){setSettingsNotice('Save your changes or discard them before closing.');return;}setSettings(open);setSettingsNotice('');}}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/30"/><Dialog.Content onCloseAutoFocus={e=>{e.preventDefault();settingsTrigger.current?.focus();}} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-border bg-card shadow-xl"><div className="shrink-0 border-b border-border p-4"><div className="flex items-center justify-between"><Dialog.Title className="text-base font-semibold">Workflow settings</Dialog.Title><Dialog.Close className={button}>Close</Dialog.Close></div><Dialog.Description className="mt-1 text-xs text-muted-foreground">Configure routing for one brand and its draft preferences.</Dialog.Description><div className="mt-3"><FilterSelect aria-label="Settings brand" value={brand} onValueChange={value=>{if(settingsDirty){setSettingsNotice('Save your changes before switching brands.');return;}setBrand(value);setSelected('');const url=new URL(window.location.href);if(value==='all')url.searchParams.delete('brand');else url.searchParams.set('brand',pilotGuilds[value as keyof typeof pilotGuilds]?.slug??value);window.history.replaceState(null,'',url);}}><option value="all">Choose a brand</option>{brands.map(b=><option key={b.guild_id} value={b.guild_id}>{b.name}</option>)}</FilterSelect></div></div><div className="min-h-0 flex-1 overflow-y-auto p-3">{settingsNotice&&<div role="status" className="mb-3 rounded bg-amber-50 p-3 text-xs text-amber-900">{settingsNotice}<button className="ml-2 underline" onClick={()=>{setSettingsDirty(false);setSettingsNotice('');setSettings(false);}}>Discard & close</button></div>}<BrandSettings onDirty={setSettingsDirty} key={brand} brand={brands.find(b=>b.guild_id===brand)} onSaved={load}/></div></Dialog.Content></Dialog.Portal></Dialog.Root>
    {mode==='Community'&&<p className="text-xs text-muted-foreground">Review drafts for creator shoutouts, top videos, hype and inspo, prepared from Tempo data and shared Discord activity.</p>}
    {mode==='Community'?<CommunityStudio brand={brand} brands={brands} edits={communityEdits.current}/>:<div className="grid items-stretch gap-3 lg:h-[calc(100dvh-280px)] lg:min-h-[420px] lg:grid-cols-[300px_minmax(0,1fr)]" data-testid="inbox-split"><aside className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card"><div className="flex items-center gap-2 border-b border-border p-3"><Search size={16}/><input className="w-full bg-transparent p-1 text-sm outline-none" aria-label="Find creator, question or owner" placeholder="Find creator, question or owner" value={query} onChange={e=>{setQuery(e.target.value);setSelected('');}}/></div><div className="max-h-[55vh] min-h-0 flex-1 overflow-y-auto overscroll-contain lg:max-h-none">{filtered.map(c=><button key={c.channel_id} className={`w-full border-b border-l-[3px] border-b-border px-3 py-2.5 text-left ${current?.channel_id===c.channel_id?'border-l-primary bg-primary/10':'border-l-transparent hover:bg-secondary/40'}`} onClick={()=>setSelected(c.channel_id)} aria-pressed={current?.channel_id===c.channel_id}><div className="flex items-start gap-2.5"><CreatorAvatar key={c.channel_id} channelId={c.channel_id} name={c.metrics?.creator_name||c.name}/><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><span className="text-sm font-semibold">{c.metrics?.creator_name||c.name}</span><span className="text-xs text-muted-foreground">{map.get(c.guild_id)?.name}</span></div><p className="mt-1 line-clamp-2 text-xs leading-4 text-muted-foreground">{c.assessment?.issue??(c.synced_at?'Reading the conversation…':'Waiting for first scan')}</p><div className="mt-1 flex flex-wrap gap-2 text-[11px]"><span className={`rounded px-1.5 py-0.5 font-medium ${escalated(c,map.get(c.guild_id))?'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300':'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'}`}>{followupDue(c)?'Follow up':laneLabels[workLane(c)]}</span><span className="text-muted-foreground">{c.owner_label||('Suggested: '+(map.get(c.guild_id)?.settings.firstOwner||'Unassigned'))}</span></div></div></div></button>)}{!filtered.length&&<p className="p-8 text-sm text-muted-foreground">{data?'No candidates in this view. Team follow-through, Check context and Older work remain available.':'Loading your workspace…'}</p>}</div></aside>

    <section className="min-h-0">{current?<ReviewCard key={`${current.channel_id}:${revision}`} channel={current} brand={map.get(current.guild_id)!} savedEdit={edits.current.get(current.channel_id)} remember={edit=>{if(edit)edits.current.set(current.channel_id,edit);else edits.current.delete(current.channel_id);}} onSaved={async(advance=false,message)=>{if(message)setSentFeedback(message);edits.current.delete(current.channel_id);await load();setRevision(v=>v+1);if(advance)setSelected(next??'__done__');}} onNext={next?()=>setSelected(next):undefined} onReset={()=>{edits.current.delete(current.channel_id);setRevision(v=>v+1);}}/>:<div className="rounded-md border border-dashed border-border p-10 text-center text-muted-foreground">{selected==='__done__'?'You reached the end of this queue. This pass is finished. Choose another queue to continue.':'Choose a view to start.'}</div>}</section></div>}

    <details className="border-t border-border pt-2 text-xs text-muted-foreground"><summary className="cursor-pointer font-medium">Sync details</summary><div className="mt-3 space-y-2">{brands.map(b=><p key={b.guild_id}>{b.name}: {channels.filter(c=>c.guild_id===b.guild_id&&c.synced_at).length}/{channels.filter(c=>c.guild_id===b.guild_id).length} scanned, {channels.filter(c=>c.guild_id===b.guild_id&&c.assessment_hash===c.source_hash&&c.assessment).length} prepared. Last batch {date(b.scanned_at)}{b.scan_error?' · '+b.scan_error:''} · Escalation: {b.settings.escalationHours?`${b.settings.escalationHours} hours to ${b.settings.escalationOwner||'unassigned'}`:'not configured'}</p>)}<p>Up to 80 AI preparation attempts per brand each day; remaining work continues on later passes. Official bot API, bounded recent history. Private DMs remain a separate workflow. Drafts are never sent automatically. Owner labels coordinate work; they do not grant access or notify teammates.</p>{process.env.NODE_ENV === 'development' && <Link href="/community-operations/catch-up/saved" className="underline">Open the saved DM and manual review</Link>}</div></details>

  </section>;

}



function ReviewCard({channel:c,brand,onSaved,onNext,onReset,savedEdit,remember}:{channel:OpsChannel;brand:OpsBrand;onSaved:(advance?:boolean,message?:string)=>Promise<void>;onNext?:()=>void;onReset:()=>void;savedEdit?:ReviewEdit;remember:(edit:ReviewEdit|null)=>void}){

  const [version]=useState(savedEdit?.version??c.updated_at),[owner,setOwner]=useState(savedEdit?.owner??(c.owner_label||brand.settings.firstOwner||'')),[note,setNote]=useState(savedEdit?.note??c.note),[draft,setDraft]=useState(savedEdit?.draft??c.draft),[status,setStatus]=useState(savedEdit?.status??c.status),[followup,setFollowup]=useState(savedEdit?.followup??(c.followup_at?new Date(new Date(c.followup_at).getTime()-new Date(c.followup_at).getTimezoneOffset()*60000).toISOString().slice(0,16):''));

  const [saving,setSaving]=useState(false),[notice,setNotice]=useState(''),[messages,setMessages]=useState<OpsMessage[]|null>(null),[expanded,setExpanded]=useState(false);

  const [assignmentOpen,setAssignmentOpen]=useState(false);

  const stale=version!==c.updated_at;

  const initialFollowup=c.followup_at?new Date(new Date(c.followup_at).getTime()-new Date(c.followup_at).getTimezoneOffset()*60000).toISOString().slice(0,16):'';

  const dirty=owner!==(c.owner_label||brand.settings.firstOwner||'')||note!==c.note||draft!==c.draft||status!==c.status||followup!==initialFollowup;

  useEffect(()=>{remember(dirty?{version,owner,note,draft,status,followup}:null);},[version,owner,note,draft,status,followup,dirty,remember]);

  async function refresh(){setSaving(true);try{await read(await fetch('/api/community-operations/queue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channelId:c.channel_id})}));await onSaved();}catch(e){setNotice((e as Error).message);}finally{setSaving(false);}}

  useEffect(()=>{const abort=new AbortController();fetch('/api/community-operations/queue?channel='+c.channel_id,{signal:abort.signal,cache:'no-store'}).then(read).then(d=>setMessages(d.messages)).catch(()=>{if(!abort.signal.aborted)setNotice('Conversation could not load.');});return()=>abort.abort();},[c.channel_id,c.source_hash]);

  async function save(advance=false,completion?:OpsChannel['status']){const nextStatus=completion??status;if(nextStatus==='waiting_team'&&(!owner.trim()||!followup)){setNotice('Choose an owner and follow-up time before assigning.');return;}setSaving(true);setNotice('');try{if(nextStatus==='resolved'&&(!c.synced_at||Date.now()-Date.parse(c.synced_at)>900000)){await read(await fetch('/api/community-operations/queue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channelId:c.channel_id,refreshOnly:true})}));}await read(await fetch('/api/community-operations/queue',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({channelId:c.channel_id,updatedAt:version,status:nextStatus,owner,followupAt:followup?new Date(followup).toISOString():null,note,draft})}));await onSaved(advance);}catch(e){setNotice((e as Error).message);}finally{setSaving(false);}}

  const metadataDirty=owner!==(c.owner_label||brand.settings.firstOwner||'')||note!==c.note||status!==c.status||followup!==initialFollowup;

  const snapshot=c.metrics?.snapshot;
  const evidence=messages?.find(m=>m.id===c.assessment?.waitingSinceMessageId)??messages?.find(m=>c.assessment?.evidenceIds.includes(m.id));

  return <article aria-label="Conversation panel" className="flex max-h-[85dvh] flex-col overflow-hidden rounded-lg border border-slate-200 lg:h-full lg:max-h-none bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60"><header className="shrink-0 border-b border-primary/15 bg-primary/5 px-3 py-2"><p className="text-xs font-medium text-primary">{brand.name} · {c.kind==='community'?'Community opportunity':c.assessment?.category??'Preparing'}</p><div className="mt-1 flex items-center gap-2"><CreatorAvatar key={c.channel_id} channelId={c.channel_id} name={c.metrics?.creator_name||c.name} large/><h2 className="text-lg font-semibold">{c.metrics?.creator_name||c.name}</h2></div><p className="mt-1 text-[11px] text-muted-foreground">Last checked {date(c.synced_at)}{c.error?' · '+c.error:''}</p></header><div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3" data-testid="conversation-scroll">

    {stale&&<p role="status" className="rounded bg-amber-500/10 p-3 text-sm">This conversation changed. Your edits are preserved. <button className="underline" onClick={onReset}>Discard edits and load latest</button></p>}

    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What they need</h3><p className="mt-1 text-sm leading-5">{c.assessment?.issue??'The background worker will prepare this conversation after its first scan.'}</p></div><div className="rounded-lg border border-primary/15 bg-primary/5 p-3"><h3 className="text-xs font-semibold text-primary">NEXT ACTION · {c.owner_label?'Assigned: ':'Suggested: '}{owner||'Unassigned'}</h3><p className="mt-1 text-sm leading-5">{c.assessment?.nextMove??'You can open Discord while preparation runs.'}</p>{escalated(c,brand)&&<p className="mt-2 text-sm font-medium text-amber-600">Escalate to {brand.settings.escalationOwner||'an assigned manager'}</p>}</div>

    {evidence&&<blockquote className="border-l-2 border-primary/30 pl-3 text-xs text-muted-foreground"><p className="font-medium">{evidence.author} · {date(evidence.at)}</p><p className="mt-1 line-clamp-3 whitespace-pre-wrap">{evidence.text}</p></blockquote>}
    {draft&&workLane(c)!=='reply'&&<p className="rounded bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">Check context before using this draft. It is not in the reply queue.</p>}
    {c.assessment?.action==='reply'||draft?<><label className="block text-xs font-medium">{c.kind==='community'?'Post draft':'Reply draft'}<textarea className={`${input} mt-2 min-h-24`} value={draft} onChange={e=>{setDraft(e.target.value);}} placeholder="A draft appears when there’s a useful, supported reply."/></label><button className={button} disabled={!draft||stale||c.assessment_hash!==c.source_hash} onClick={async()=>{try{await navigator.clipboard.writeText(draft);setNotice('Copied. Nothing has been sent.');}catch{setNotice('Select and copy the draft text.');}}}>Copy draft</button><button className={`${button} ml-2`} disabled={saving||stale} onClick={()=>void save()}>Save draft</button></>:<p className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">Internal follow-through first. This item has no suggested creator reply.</p>}

    <p className="rounded-lg bg-secondary/50 p-3 text-xs text-muted-foreground">Version 1: review and copy the draft, then send it in Discord. Nothing is sent automatically.</p>
    <details className="rounded border border-border p-2 text-xs"><summary className="cursor-pointer font-medium">Creator snapshot & accounts</summary><div className="mt-2 space-y-2">    {c.kind==='ticket'&&<div className="grid grid-cols-3 gap-2 rounded-md bg-secondary/40 p-3 text-xs"><div><p className="text-muted-foreground">Reported brand GMV · 30d</p><p className="mt-2 font-semibold">{typeof snapshot?.gmv30==='number'&&!snapshot?.matchError?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(snapshot.gmv30):'Not connected'}</p></div><div><p className="text-muted-foreground">Last TikTok post observed</p><p className="mt-2 font-semibold">{snapshot?.matchError?'Match needs review':date(snapshot?.lastPost as string|null)}</p></div><div><p className="text-muted-foreground">Last Discord activity</p><p className="mt-2 font-semibold">{date(c.last_creator_at||c.last_message_at)}</p></div></div>}

    {c.metrics&&<p className="text-xs text-muted-foreground">{c.metrics.handles.map(h=>'@'+h).join(', ')} · Data through {String(snapshot?.through??'unknown')} · Refreshed {date(c.metrics.imported_at)} · {String(snapshot?.coverage??'Coverage not established')}</p>}

</div></details>
    <details open={assignmentOpen} onToggle={e=>setAssignmentOpen(e.currentTarget.open)} className="border-t border-border pt-3"><summary className="cursor-pointer text-xs font-medium">Assignment, status & follow-up</summary><p className="my-2 text-xs text-muted-foreground">Assignment tracks ownership here; it does not send a notification. Set a follow-up to bring it back when due.</p>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs">Responsible person<input className={`${input} mt-1`} value={owner} onChange={e=>setOwner(e.target.value)} placeholder="Choose a name"/></label><label className="text-xs">Status<FilterSelect className="mt-1 w-full" value={status} onValueChange={value=>setStatus(value as OpsChannel['status'])}>{[['open','Needs review'],['waiting_team','Waiting on team'],['waiting_creator','Waiting on creator'],['snoozed','Follow up later'],['resolved','Resolved']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</FilterSelect></label><label className="text-xs">Follow-up (your local time)<input type="datetime-local" className={`${input} mt-1`} value={followup} onChange={e=>setFollowup(e.target.value)}/></label><label className="text-xs">Decision / handoff note<input className={`${input} mt-1`} value={note} onChange={e=>setNote(e.target.value)} placeholder="Correction or handoff context"/></label></div>

    <div className="mt-2 flex flex-wrap gap-2"><button className={button} disabled={saving||stale} onClick={()=>void save()}>Save changes</button><button className={button} disabled={saving||dirty} onClick={()=>void refresh()}>Refresh conversation</button><button className={button} disabled={saving||stale||!owner.trim()||!followup} onClick={()=>void save(true,'waiting_team')}>Assign & next</button></div></details>
    <div className="flex flex-wrap gap-2">{(c.assessment?.evidenceIds??[]).map((id,i)=><a key={id} href={opsUrl(c.guild_id,c.channel_id,id)} target="_blank" rel="noreferrer" className={button}>Source {i+1}<ExternalLink size={13}/></a>)}<a href={opsUrl(c.guild_id,c.channel_id)} target="_blank" rel="noreferrer" className={button}>Open Discord<ExternalLink size={13}/></a></div>

    {expanded&&<ConversationThread channelId={c.channel_id} guildId={c.guild_id} messages={messages}/>}

    {metadataDirty&&<p className="text-xs text-amber-700">Save assignment or follow-up changes before sending.</p>}
    {dirty&&<p className="text-xs text-muted-foreground">Unsaved edits are kept when switching cards. Save before leaving this page.</p>}{notice&&<p role="status" className="text-sm text-primary">{notice}</p>}</div><div className="z-10 flex shrink-0 flex-wrap justify-between gap-2 border-t border-border bg-card p-2.5"><button className={button} onClick={()=>setExpanded(!expanded)}>{expanded?'Hide Discord conversation':'Read Discord conversation'}</button><div className="flex flex-wrap gap-2"><button className={button} disabled={saving} onClick={()=>setAssignmentOpen(true)}>{workLane(c)==='decision'?'Record decision':'Assign'}</button><button className={button} disabled={saving||stale} onClick={()=>void save(true,'resolved')}>Resolve & next</button><button className={button} disabled={!onNext||saving} onClick={onNext}>Skip<ArrowRight size={14}/></button></div></div>


  </article>;

}



function BrandSettings({brand,onSaved,onDirty}:{brand?:OpsBrand;onSaved:()=>Promise<void>;onDirty:(dirty:boolean)=>void}){

  const [owner,setOwner]=useState(brand?.settings.firstOwner??''),[escalation,setEscalation]=useState(brand?.settings.escalationOwner??''),[hours,setHours]=useState(String(brand?.settings.escalationHours??'')),[voice,setVoice]=useState(brand?.settings.voice??''),[priorities,setPriorities]=useState(brand?.settings.priorities??''),[enabled,setEnabled]=useState(brand?.settings.communityEnabled!==false),[version,setVersion]=useState(brand?.updated_at),[message,setMessage]=useState(''),[saving,setSaving]=useState(false);

  const [categories,setCategories]=useState(brand?.settings.communityCategories??['recognition','top_videos','inspo','campaign']),[dailyLimit,setDailyLimit]=useState(brand?.settings.communityDailyLimit??3);
  useEffect(()=>{onDirty(!!brand&&(owner!==(brand.settings.firstOwner??'')||escalation!==(brand.settings.escalationOwner??'')||hours!==String(brand.settings.escalationHours??'')||voice!==(brand.settings.voice??'')||priorities!==(brand.settings.priorities??'')||enabled!==(brand.settings.communityEnabled!==false)||dailyLimit!==(brand.settings.communityDailyLimit??3)||JSON.stringify(categories)!==JSON.stringify(brand.settings.communityCategories??['recognition','top_videos','inspo','campaign'])));},[brand,owner,escalation,hours,voice,priorities,enabled,dailyLimit,categories,onDirty]);
  if(!brand)return <p className="p-3 text-sm text-muted-foreground">Choose a brand to edit its workflow.</p>;
  async function save(){if(!brand)return;setSaving(true);try{await read(await fetch('/api/community-operations/queue',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({guildId:brand.guild_id,updatedAt:version??brand.updated_at,firstOwner:owner,escalationOwner:escalation,escalationHours:hours?Number(hours):null,voice,priorities,communityEnabled:enabled,communityCategories:categories,communityDailyLimit:dailyLimit})}));setMessage('Saved. Existing drafts will be checked against this guidance on the next preparation pass.');setVersion(undefined);await onSaved();}catch(e){setMessage((e as Error).message);}finally{setSaving(false);}}

  return <section className="space-y-3 rounded-md border border-border bg-card p-5"><h2 className="font-semibold">{brand.name}: team & voice</h2><p className="text-xs text-muted-foreground">Choose another brand above to configure its workflow. Escalation flags appear in the queue; no notifications are sent.</p><div className="grid items-end gap-3 sm:grid-cols-3"><label className="text-xs">First response owner<input className={`${input} mt-1`} value={owner} onChange={e=>setOwner(e.target.value)}/></label><label className="text-xs">Escalate to<input className={`${input} mt-1`} value={escalation} onChange={e=>setEscalation(e.target.value)}/></label><label className="text-xs">Hours unanswered before escalation<input className={`${input} mt-1`} type="number" min="1" max="720" value={hours} onChange={e=>setHours(e.target.value)} placeholder="Not configured"/></label></div><label className="block text-xs">Voice guidance and approved examples<textarea className={`${input} mt-1`} value={voice} onChange={e=>setVoice(e.target.value)}/></label><label className="block text-xs">Current brand priorities<input className={`${input} mt-1`} value={priorities} onChange={e=>setPriorities(e.target.value)}/></label><label className="flex gap-2 text-sm"><input className="accent-[var(--primary)]" type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Prepare community suggestions automatically</label><div className="flex flex-wrap gap-4">{[['recognition','Recognition'],['top_videos','Top videos'],['inspo','Coaching & inspo'],['campaign','Campaign posts']].map(([key,label])=><label key={key} className="flex gap-2 text-xs"><input className="accent-[var(--primary)]" type="checkbox" checked={categories.includes(key)} onChange={e=>setCategories(e.target.checked?[...categories,key]:categories.filter(c=>c!==key))}/>{label}</label>)}</div><label className="block text-xs">Maximum new community drafts per day<input className={`${input} mt-1 max-w-24`} type="number" min="1" max="8" value={dailyLimit} onChange={e=>setDailyLimit(Number(e.target.value))}/></label><button className={button} disabled={saving} onClick={()=>void save()}>Save settings</button><p role="status" className="text-sm">{message}</p></section>;

}
