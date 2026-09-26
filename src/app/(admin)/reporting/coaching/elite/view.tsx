"use client";
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChoiceMenu } from '@/components/ui/choice-menu';
import { CreatorPortrait } from '@/components/creators/creator-portrait';
import { PageHeader } from '@/components/ui/page-header';
import { NavigationLink } from '@/components/ui/navigation-link';
import { Button } from '@/components/ui/button';
import { coachingWeeks, sundayToday, weekLabel } from '@/lib/coaching/model';
import { shiftDay, type EliteBrief, type EliteRow } from '@/lib/coaching/elite';
import styles from './view.module.css';
const money = (n: number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
function Metric({metric,currency=false}: {metric:EliteRow['current']['gmv'];currency?:boolean}) {
 return <><strong>{metric.value===null?'Not available':currency?money(metric.value):metric.value}</strong><small>{metric.days}/7 recorded days{metric.days<7?' · partial':''}</small></>;
}
function Change({delta,currency=false}:{delta:EliteRow['change']['gmv'];currency?:boolean}) {
 return <small>{delta ? `${delta.amount>0?'+':''}${currency?money(delta.amount):delta.amount}${delta.percent===null?' (no prior baseline)':` (${delta.percent>0?'+':''}${delta.percent.toFixed(0)}%)`}` : 'Comparison needs complete weeks'}</small>;
}
export function EliteView() {
 const current = sundayToday();
 const options=useMemo(()=>coachingWeeks(shiftDay(current,-7)).map(o=>({...o,description:undefined})),[current]);
 const [week,setWeek]=useState(()=>shiftDay(current,-7)), [data,setData]=useState<EliteBrief|null>(null), [error,setError]=useState(''), [retry,setRetry]=useState(0), [search,setSearch]=useState('');
 useEffect(()=>{const controller=new AbortController();
 fetch(`/api/coaching/elite?week=${week}`,{signal:controller.signal,cache:'no-store'}).then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.error);if(!controller.signal.aborted)setData(body);}).catch(e=>{if(!controller.signal.aborted)setError(e.message || 'Could not load brief');});
 return ()=>controller.abort();},[week,retry]);
 useEffect(()=>{const reset=()=>{setData(null);setError('');setRetry(n=>n+1);};window.addEventListener('workspace-context-changed',reset);return()=>window.removeEventListener('workspace-context-changed',reset);},[]);
 const rows=data?.rows.filter(r=>r.name.toLowerCase().includes(search.toLowerCase())) ?? [];
 const complete=data?.rows.filter(r=>r.current.gmv.days===7 && r.current.posts.days===7).length ?? 0;
 const movers=data?.rows.filter(r=>r.change.gmv && r.change.gmv.amount>0).sort((a,b)=>b.change.gmv!.amount-a.change.gmv!.amount).slice(0,3) ?? [];
 const followups=data?.rows.filter(r=>['No recorded posts','Posting declined','GMV declined'].includes(r.change.signal)) ?? [];
 return <div className={styles.page}>
  <PageHeader title="Elite creator brief" subtitle="JiYu pilot · Weekly creator performance for Victoria and the coaching team." />
  <NavigationLink href="/reporting/coaching" direction="back">Coach submissions</NavigationLink>
  <div className={styles.toolbar}><ChoiceMenu label="Reporting week" value={week} options={options} onChange={value=>{setData(null);setError('');setWeek(value);}}/><span>Sunday–Saturday · Completed weeks</span></div>
  {error ? <div role="alert" className={styles.panel}><p>{error}</p><Button onClick={()=>{setError('');setData(null);setRetry(n=>n+1);}}>Retry</Button></div> : !data ? <div role="status" className={styles.panel}>Loading Elite performance and prior-week coverage...</div> : <>
   <div className={styles.summary}><div><small>LINKED ELITE CREATORS</small><strong>{data.rows.length}</strong><span>Current Elite tags in {data.brand}</span></div><div><small>COMPLETE WEEK COVERAGE</small><strong>{complete}/{data.rows.length}</strong><span>Both GMV and published-post days</span></div><div><small>WORTH A CLOSER LOOK</small><strong>{followups.length}</strong><span>Recorded posting or GMV declines</span></div></div>
   <p className={styles.context}>{weekLabel(data.week)}. Compared with {weekLabel(data.previousStart).replace('Week of ','')}. This uses today’s Elite tags, not a historical membership snapshot. {data.unmatched>0?`${data.unmatched} tagged roster ${data.unmatched===1?'entry needs':'entries need'} a linked creator identity.`:''}</p>
   <div className={styles.brief}><section><h2>Review this week{followups.length>4?` · Showing 4 of ${followups.length}`:''}</h2>{followups.length?followups.slice(0,4).map(r=><Link key={r.id} href={`/creators/${r.id}?brand=jiyu&range=custom&start=${week}&end=${data.end}`}><strong>{r.name}</strong><span>{r.change.signal}. Review their content and context before following up.</span></Link>):<p>No follow-up signal is supported by complete recorded data. Check coverage before drawing conclusions.</p>}</section><section><h2>Biggest GMV gains</h2>{movers.length?movers.map(r=><Link key={r.id} href={`/creators/${r.id}?brand=jiyu&range=custom&start=${week}&end=${data.end}`}><strong>{r.name} <em>+{money(r.change.gmv!.amount)}</em></strong><span>Review what performed well and whether it can be repeated.</span></Link>):<p>No comparable gain is available for this period.</p>}</section></div>
   <div className={styles.panel}><div className={styles.tableHead}><h2>Creator activity</h2><input aria-label="Find an Elite creator" placeholder="Find a creator" value={search} onChange={e=>setSearch(e.target.value)}/></div>
    <div className={styles.scroll}><table><thead><tr><th>Creator</th><th>GMV</th><th>Published posts</th><th>Posting days</th><th>Review context</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><Link className={styles.identity} href={`/creators/${r.id}?brand=jiyu&range=custom&start=${week}&end=${data.end}`}><CreatorPortrait creatorId={r.id} source={r.avatar} name={r.name} className={styles.portrait}/><span>{r.name}<small>Open creator profile</small></span></Link></td><td><Metric metric={r.current.gmv} currency/><Change delta={r.change.gmv} currency/></td><td><Metric metric={r.current.posts}/><Change delta={r.change.posts}/></td><td><div className={styles.days} aria-label={`${r.current.activeDays} days with recorded posts`}>{Array.from({length:7},(_,i)=>{const d=r.days[i];return <span key={i} data-state={d?.posts==null?'unknown':Number(d.posts)>0?'active':'quiet'} title={`${shiftDay(week,i)}: ${d?.posts==null?'No coverage':`${d.posts} published posts`}`}>{['S','M','T','W','T','F','S'][i]}</span>;})}</div><small>{r.current.activeDays} active days observed</small></td><td><strong>{r.unavailable?'Data unavailable':r.change.signal}</strong><small>{r.current.through?`Latest evidence ${r.current.through}`:'No recorded evidence this week'}</small></td></tr>)}</tbody></table></div>
    {!rows.length && <p className={styles.context}>{data.rows.length?'No creators match your search.':'No creators currently carry the Elite tag in this brand.'}</p>}
   </div>
   <details className={styles.method}><summary>How to read this brief</summary><p>GMV comes from daily creator performance imports for JiYu. Posts are unique videos published in the selected period, not lifetime video counts. Partial totals include only recorded days; comparisons require seven recorded days in both weeks. Posting strips show unknown days separately from recorded zeroes. Gains and declines are review prompts, not evidence that coaching caused a result.</p><p>Discord check-ins, last contact, and task completion are not inferred from these metrics. This brief does not send messages or change creator tags.</p></details>
  </>}
 </div>;
}
