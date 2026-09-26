'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, ChevronRight, Search, X } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import styles from './workspace.module.css';
import { WeeklyAccountability } from './weekly-accountability';

// Fictional, self-contained design fixtures. No live performance or assignments.
const people = [
  { id: 'a', name: 'Alex Morgan', handle: 'alexfinds', coach: 'Victoria', cohort: 'Elite', gmv: 8420, previous: 6200, posts: 9, days: [1,2,1,0,2,1,2], signal: 'Building momentum', task: 'Review the winning hook and agree on two follow-up videos.', due: 'Sep 23', status: 'Open', checkin: true },
  { id: 'b', name: 'Jordan Lee', handle: 'jordanwellness', coach: 'Victoria', cohort: 'Elite', gmv: 5600, previous: 7200, posts: 2, days: [0,1,0,0,1,0,0], signal: 'Posting slowed', task: 'Check what is blocking the next post and agree on a restart date.', due: 'Sep 24', status: 'Open', checkin: false },
  { id: 'c', name: 'Taylor Brooks', handle: 'taylorspicks', coach: 'Macy', cohort: 'Development', gmv: 340, previous: 0, posts: 7, days: [1,1,1,1,1,1,1], signal: 'First recorded sale', task: 'Review the first converting video and choose one angle to repeat.', due: 'Sep 24', status: 'Open', checkin: true },
  { id: 'd', name: 'Sam Rivera', handle: 'samreviews', coach: 'Macy', cohort: 'Development', gmv: 125, previous: 80, posts: 5, days: [0,1,1,0,1,1,1], signal: 'Consistent progress', task: 'Give feedback on the submitted opening and record the next experiment.', due: 'Sep 25', status: 'Done', checkin: true },
  { id: 'e', name: 'Casey James', handle: 'caseycreates', coach: 'Macy', cohort: 'Development', gmv: 0, previous: 0, posts: 0, days: [0,0,0,0,0,0,0], signal: 'No posts recorded', task: 'Check sample delivery and offer help with the first video.', due: 'Sep 25', status: 'Open', checkin: false },
];
type Person = typeof people[number];
type View = 'overview' | 'followups' | 'review';
const money = (value: number) => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
const delta = (person: Person) => person.previous ? `${person.gmv >= person.previous ? '+' : ''}${Math.round((person.gmv / person.previous - 1) * 100)}%` : person.gmv ? 'New sales' : 'No change';

export function CoachingWorkspace() {
  const [view, setView] = useState<View>('overview');
  const [coach, setCoach] = useState('All coaches');
  const [cohort, setCohort] = useState('All cohorts');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>(['d']);
  const [notes, setNotes] = useState<Record<string,string>>({});
  const filtered = people.filter(p => (coach === 'All coaches' || p.coach === coach) && (cohort === 'All cohorts' || p.cohort === cohort) && `${p.name} ${p.handle}`.toLowerCase().includes(search.toLowerCase()));
  const person = filtered.find(p => p.id === selected);
  const sales = filtered.reduce((sum,p) => sum+p.gmv,0);
  const previous = filtered.reduce((sum,p) => sum+p.previous,0);
  const pending = filtered.filter(p=>!done.includes(p.id));
  function changeFilter(setter: (value:string)=>void, value:string) { setter(value); setSelected(null); }

  return <div className={styles.workspace}>
    <div className={styles.preview}><strong>Interactive design preview</strong><span>Sample activity and creator metrics. Changes reset when you reload. Nothing is sent.</span></div>
    <Link className={styles.back} href="/reporting">Reporting / Coaching</Link>
    <PageHeader title="A clearer week for your creators." eyebrow="Coaching" subtitle="See progress. Focus the next conversation. Follow through." actions={<div className={styles.period}><strong>Demo brand</strong><span>{view==='review'?'Weekly submissions':'Sep 14–20, 2026'}</span><small>{view==='review'?'Reviewer: Victoria':'Previous week: Sep 7–13'}</small></div>} />
    <div className={styles.toolbar}>
      <nav aria-label="Coaching views">{([['overview','Overview'],['followups','Creator follow-ups'],['review','Weekly review']] as const).map(([key,label])=><button key={key} aria-current={view===key?'page':undefined} onClick={()=>{setView(key);setSearch('');setSelected(null);}}>{label}{key==='followups' && <span>{pending.length}</span>}</button>)}</nav>
      <div className={styles.filters} hidden={view==='review'}>
        <select aria-label="Filter by coach" value={coach} onChange={e=>changeFilter(setCoach,e.target.value)}><option>All coaches</option><option>Victoria</option><option>Macy</option></select>
        <select aria-label="Filter by cohort" value={cohort} onChange={e=>changeFilter(setCohort,e.target.value)}><option>All cohorts</option><option>Elite</option><option>Development</option></select>
      </div>
    </div>
    {view === 'overview' && <>
      <div className={styles.metrics}>
        <Metric label="Creator GMV" value={money(sales)} detail={`${sales>=previous?'+':''}${money(sales-previous)} vs previous week`} />
        <Metric label="Posts published" value={String(filtered.reduce((n,p)=>n+p.posts,0))} detail={`${filtered.filter(p=>p.posts>0).length} of ${filtered.length} creators active`} />
        <Metric label="Assignment check-ins" value={`${filtered.filter(p=>p.checkin).length} / ${filtered.length}`} detail="Sample assignment submissions" />
        <Metric label="Follow-ups remaining" value={String(pending.length)} detail={`${filtered.filter(p=>done.includes(p.id)).length} completed in this preview`} />
      </div>
      <div className={styles.brief}>
        <div><span className={styles.eyebrow}>Your weekly read</span><h2>{pending.length ? 'Turn this week’s signals into next steps.' : 'Your sample follow-ups are complete.'}</h2><p>{filtered.length} {filtered.length===1?'creator':'creators'} in this view. Review posting consistency alongside sales, then choose the next conversation.</p></div>
        <button className={styles.primary} onClick={()=>setView('followups')}>Review follow-ups <ArrowUpRight size={16}/></button>
      </div>
    </>}
    {view !== 'review' ? <section className={styles.card}>
      <div className={styles.sectionHead}><div><h2>{view==='overview'?'Creator progress':'A next step for every conversation'}</h2><p>{view==='overview'?'Weekly performance with coaching context.':'Demo actions for the week of Sep 21. Marking done is local to this preview.'}</p></div><div className={styles.search}><Search size={15}/><input aria-label="Search creators" placeholder="Find a creator" value={search} onChange={e=>changeFilter(setSearch,e.target.value)}/>{search && <button aria-label="Clear creator search" onClick={()=>setSearch('')}><X size={14}/></button>}</div></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Creator</th><th>{view==='overview'?'GMV · 7 days':'Next step'}</th><th>{view==='overview'?'Posting activity':'Owner / due'}</th><th>{view==='overview'?'Coaching signal':'Status'}</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>
        {filtered.map(p=><tr key={p.id} className={selected===p.id?styles.selected:undefined}>
          <td><button className={styles.identity} onClick={()=>setSelected(selected===p.id?null:p.id)} aria-expanded={selected===p.id}><span className={styles.avatar}>{p.name.split(' ').map(n=>n[0]).join('')}</span><span><strong>{p.name}</strong><small>@{p.handle} · {p.cohort}</small></span></button></td>
          {view==='overview'?<><td data-label="GMV · 7 days"><strong>{money(p.gmv)}</strong><small className={p.gmv>=p.previous?styles.positive:styles.negative}>{delta(p)}</small></td><td data-label="Posting activity"><div className={styles.activity} aria-label={`${p.posts} posts across ${p.days.filter(Boolean).length} days`}><span className={styles.bars}>{p.days.map((count,i)=><i key={i} title={`${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}: ${count} posts`} style={{height:`${count?8+count*7:3}px`,opacity:count?1:.2}} />)}</span><strong>{p.posts}<small>{p.days.filter(Boolean).length}/7 days</small></strong></div></td><td data-label="Coaching signal"><span className={styles.signal}>{p.signal}</span><small>{p.coach}</small></td></>:<><td data-label="Next step" className={styles.task}>{p.task}</td><td data-label="Owner / due"><strong>{p.coach}</strong><small>{p.due}</small></td><td data-label="Status"><button className={styles.status} aria-pressed={done.includes(p.id)} onClick={()=>setDone(old=>old.includes(p.id)?old.filter(id=>id!==p.id):[...old,p.id])}>{done.includes(p.id)?<><Check size={14}/>Done</>:'Mark done'}</button></td></>}
          <td><button className={styles.detailButton} aria-label={`View ${p.name}`} aria-expanded={selected===p.id} onClick={()=>setSelected(selected===p.id?null:p.id)}><ChevronRight size={16}/></button></td>
        </tr>)}
      </tbody></table></div>
      {!filtered.length && <p className={styles.empty}>No sample creators match. Try another filter or clear your search.</p>}
      {person && <div className={styles.detail}><div><span className={styles.eyebrow}>Next conversation · {person.coach}</span><h3>{person.name}</h3><p>{person.task}</p><div className={styles.evidence}><strong>What supports this</strong><span>{person.posts} posts across {person.days.filter(Boolean).length} days. {money(person.gmv)} GMV compared with {money(person.previous)} in the previous week.</span></div></div><div><label htmlFor="coaching-note">Coaching note <span>Preview only</span></label><textarea id="coaching-note" value={notes[person.id]??''} placeholder="Observation, next experiment, and what to check next…" onChange={e=>setNotes({...notes,[person.id]:e.target.value})}/><small>Live version: linked video or Discord evidence, authenticated owner, and saved history.</small></div></div>}
      <div className={styles.footnote}>Sample performance through Sep 20. First recorded sale describes available history, not a verified lifetime first sale.</div>
    </section>:null}
    <div hidden={view!=='review'}><WeeklyAccountability /></div>
  </div>;
}
function Metric({label,value,detail}:{label:string;value:string;detail:string}) { return <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
