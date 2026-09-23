'use client';

import { useEffect,useRef } from 'react';
import type { OpsMessage } from '@/lib/community-ops/model';
import { opsUrl } from '@/lib/community-ops/model';
import { CreatorAvatar } from './creator-avatar';

const colors=['text-indigo-700 dark:text-indigo-300','text-teal-700 dark:text-teal-300','text-rose-700 dark:text-rose-300','text-amber-800 dark:text-amber-300'];
export function ConversationThread({channelId,guildId,messages}:{channelId:string;guildId:string;messages:OpsMessage[]|null}) {
  const viewport=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(viewport.current)viewport.current.scrollTop=viewport.current.scrollHeight;},[channelId,messages]);
  const ordered=messages?[...messages].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)):[];
  const authors=[...new Set(ordered.map(m=>m.authorId))];
  return <section className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-900" aria-label="Discord conversation">
    <header className="flex justify-between border-b border-slate-200 bg-slate-200/60 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"><span className="font-semibold">Discord conversation</span><span className="text-muted-foreground">Recent history · newest at bottom</span></header>
    <div ref={viewport} className="max-h-[360px] overflow-y-auto overscroll-contain p-3">
      {!messages&&<p className="text-sm text-muted-foreground">Loading conversation...</p>}
      {messages&&!ordered.length&&<p className="text-sm text-muted-foreground">No messages were imported.</p>}
      {ordered.map((m,index)=>{
        const previous=ordered[index-1];
        const date=new Date(m.at).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
        const newDay=!previous||new Date(previous.at).toDateString()!==new Date(m.at).toDateString();
        const grouped=!newDay&&previous?.authorId===m.authorId&&Date.parse(m.at)-Date.parse(previous.at)<300000;
        return <div key={m.id}>
          {newDay&&<div className="my-3 flex items-center gap-3 text-[10px] font-medium text-muted-foreground"><span className="h-px flex-1 bg-slate-300 dark:bg-slate-700"/>{date}<span className="h-px flex-1 bg-slate-300 dark:bg-slate-700"/></div>}
          <div className={`flex items-start gap-2.5 ${grouped?'mt-1':'mt-4'}`}>
            {grouped?<span className="w-9 shrink-0"/>:<CreatorAvatar channelId={channelId} authorId={m.authorId} name={m.author}/>}
            <div className="min-w-0 flex-1">
              {!grouped&&<div className="mb-1 flex flex-wrap items-baseline gap-2"><span className={`text-xs font-semibold ${colors[authors.indexOf(m.authorId)%colors.length]}`}>{m.author}</span>{m.bot&&<span className="rounded bg-violet-100 px-1 text-[9px] font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-300">BOT</span>}<time className="text-[10px] text-muted-foreground" dateTime={m.at}>{new Date(m.at).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}</time></div>}
              <div className="rounded-lg rounded-tl-sm border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-800"><p className="whitespace-pre-wrap break-words text-sm leading-6">{m.text.replace(/<@!?(\d+)>/g,(match,id)=>{const author=ordered.find(row=>row.authorId===id);return author?'@'+author.author:match;})}</p>{m.editedAt&&<span className="text-[10px] text-muted-foreground">edited</span>}{m.attachments>0&&<a href={opsUrl(guildId,channelId,m.id)} target="_blank" rel="noreferrer" className="mt-2 block text-xs font-medium text-primary underline">View {m.attachments} attachment(s) in Discord</a>}</div>
            </div>
          </div>
        </div>;
      })}
    </div>
  </section>;
}
