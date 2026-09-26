'use client';

import { useState } from 'react';
import styles from './workspace.module.css';

const coaches = ['Alicia', 'Brenna', 'Hunter'];
const tasks = [
  {key:'feedback',title:'Creator feedback',description:'Review assigned submissions and record the feedback delivered.'},
  {key:'calls',title:'Coaching calls',description:'Record the calls held, key takeaways, and follow-ups.'},
  {key:'loom',title:'Loom videos',description:'Add the walkthroughs or recorded coaching shared with creators.'},
] as const;
type TaskKey = typeof tasks[number]['key'];
type Entry = {done:boolean;evidence:string};
type Draft = {entries:Record<TaskKey,Entry>;summary:string;blockers:string};
type Submission = Draft & {revision:number;submitted:string;status:'Awaiting review'|'Changes requested'|'Reviewed';reviewNote:string};
const weeks = [{id:'2026-09-21',label:'Sep 21–27 · This week'},{id:'2026-09-14',label:'Sep 14–20'},{id:'2026-09-07',label:'Sep 7–13'}];
function blank(): Draft { return {entries:{feedback:{done:false,evidence:''},calls:{done:false,evidence:''},loom:{done:false,evidence:''}},summary:'',blockers:''}; }
function sampleHistory(): Record<string,Submission[]> {
  const history:Record<string,Submission[]> = {};
  for(const week of weeks.slice(1)) for(const coach of coaches) history[`${week.id}:${coach}`] = [{
    entries:{feedback:{done:true,evidence:'Sample: reviewed creator openings and documented the next experiment.'},calls:{done:true,evidence:'Sample: group call completed; follow-up is to test a stronger opening.'},loom:{done:true,evidence:'Sample: recorded a walkthrough of the weekly assignment.'}},
    summary:'Sample submission: creators have a clear next experiment. Next week, review the follow-through.',blockers:'',revision:1,submitted:`${week.id} · sample submission`,status:'Reviewed',reviewNote:'Sample Victoria review: clear follow-ups. Bring the results into the next review.',
  }];
  return history;
}

export function WeeklyAccountability() {
  const [week,setWeek] = useState(weeks[0].id);
  const [coach,setCoach] = useState(coaches[0]);
  const [perspective,setPerspective] = useState('Coach');
  const [drafts,setDrafts] = useState<Record<string,Draft>>({});
  const [history,setHistory] = useState(sampleHistory);
  const [reviewNote,setReviewNote] = useState('');
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const [revision,setRevision] = useState<number|null>(null);
  const key = `${week}:${coach}`;
  const versions = history[key]??[];
  const latest = versions.at(-1);
  const submission = revision === null ? latest : versions.find(s=>s.revision===revision);
  const archived = week !== weeks[0].id;
  const reviewing = perspective === 'Victoria';
  const editing = !archived && !reviewing && revision===null && (!latest || latest.status==='Changes requested');
  const draft = drafts[key]??blank();
  const shown = editing?draft:submission??draft;
  const completed = tasks.filter(t=>shown.entries[t.key].done).length;
  const status = (editing?latest:submission)?.status??'Not submitted';
  function resetView(){setError('');setMessage('');setReviewNote('');setRevision(null);}
  function update(patch:Partial<Draft>){setDrafts(old=>({...old,[key]:{...draft,...patch}}));setError('');}
  function submit(){
    if(!draft.summary.trim()){setError('Add a short weekly summary before submitting.');return;}
    if(tasks.some(t=>draft.entries[t.key].done&&!draft.entries[t.key].evidence.trim())){setError('Add a note or evidence link for each completed responsibility.');return;}
    if(completed<tasks.length&&!draft.blockers.trim()){setError('Explain unfinished work and the next step. You can submit an honest report without checking every box.');return;}
    const snapshot:Submission={...structuredClone(draft),revision:versions.length+1,submitted:new Date().toLocaleString(),status:'Awaiting review',reviewNote:''};
    setHistory(old=>({...old,[key]:[...(old[key]??[]),snapshot]}));setMessage('Submitted in this preview. Switch to Victoria’s view to review it. Nothing was sent.');setError('');
  }
  function review(next:'Reviewed'|'Changes requested'){
    if(!latest||latest.status!=='Awaiting review')return;
    if(next==='Changes requested'&&!reviewNote.trim()){setError('Explain what the coach should update.');return;}
    setHistory(old=>({...old,[key]:(old[key]??[]).map(s=>s.revision===latest.revision?{...s,status:next,reviewNote:reviewNote.trim()}:s)}));
    if(next==='Changes requested')setDrafts(old=>({...old,[key]:structuredClone(latest)}));
    setMessage(next==='Reviewed'?'Marked reviewed in this preview.':'Changes requested in this preview. The original submission remains in version history.');setError('');
  }
  return <section className={styles.card}>
    <div className={styles.sectionHead}><div><h2>Weekly coaching accountability</h2><p>Feedback, calls, and Looms. A weekly handoff for Victoria to review.</p></div><div className={styles.filters}>
      <select aria-label="Submission week" value={week} onChange={e=>{setWeek(e.target.value);resetView();}}>{weeks.map(w=><option key={w.id} value={w.id}>{w.label}</option>)}</select>
      <select aria-label="Preview perspective" value={perspective} onChange={e=>{setPerspective(e.target.value);resetView();}}><option value="Coach">Preview as coach</option><option value="Victoria">Preview as Victoria</option></select>
    </div></div>
    <div className={styles.accountability}>
      <aside className={styles.coachList} aria-label="Coach submissions">{coaches.map(name=>{const last=history[`${week}:${name}`]?.at(-1);return <button key={name} aria-pressed={coach===name} onClick={()=>{setCoach(name);resetView();}}><span className={styles.avatar}>{name[0]}</span><span><strong>{name}</strong><small>{last?.status??'Not submitted'}</small></span><span className={styles.submissionCount}>{last?tasks.filter(t=>last.entries[t.key].done).length:tasks.filter(t=>(drafts[`${week}:${name}`]??blank()).entries[t.key].done).length}/3</span></button>;})}<p>Example responsibilities, not final quotas. No real coach activity is represented here.</p></aside>
      <div className={styles.submission}>
        <div className={styles.submissionHeader}><div><span className={styles.eyebrow}>{weeks.find(w=>w.id===week)?.label}</span><h3>{coach}’s weekly report</h3><p>{completed}/3 responsibilities checked · {status}</p></div>{versions.length>0&&<select aria-label="Submission version" value={revision??''} onChange={e=>{setRevision(e.target.value?Number(e.target.value):null);setError('');}}><option value="">Latest {editing?'draft':'submission'}</option>{versions.map(s=><option key={s.revision} value={s.revision}>Submission v{s.revision} · {s.status}</option>)}</select>}</div>
        {submission && !editing && <p className={styles.submissionMeta}>Submitted by {coach} · {submission.submitted} · Version {submission.revision}</p>}
        {(editing?latest:submission)?.status==='Changes requested'&&<div className={styles.reviewRequest}><strong>Victoria requested changes</strong><p>{(editing?latest:submission)?.reviewNote}</p></div>}
        {tasks.map(task=><div className={styles.checklistItem} key={task.key}><label><input type="checkbox" checked={shown.entries[task.key].done} disabled={!editing} onChange={e=>update({entries:{...draft.entries,[task.key]:{...draft.entries[task.key],done:e.target.checked}}})}/><span><strong>{task.title}</strong><small>{task.description}</small></span></label><label className={styles.evidenceLabel} htmlFor={`evidence-${task.key}`}>Notes or evidence</label><textarea id={`evidence-${task.key}`} readOnly={!editing} value={shown.entries[task.key].evidence} placeholder="Creator names, what you covered, or a Discord / Loom link…" onChange={e=>update({entries:{...draft.entries,[task.key]:{...draft.entries[task.key],evidence:e.target.value}}})}/></div>)}
        <div className={styles.summaryFields}><div><label htmlFor="weekly-summary">Weekly summary</label><textarea id="weekly-summary" readOnly={!editing} value={shown.summary} onChange={e=>update({summary:e.target.value})} placeholder="What went well? What should Victoria know?"/></div><div><label htmlFor="weekly-blockers">Blockers & next steps</label><textarea id="weekly-blockers" readOnly={!editing} value={shown.blockers} onChange={e=>update({blockers:e.target.value})} placeholder="Explain unfinished work and what happens next."/></div></div>
        {submission?.reviewNote && submission.status==='Reviewed'&&<div className={styles.reviewRequest}><strong>Victoria’s review</strong><p>{submission.reviewNote}</p></div>}
        {reviewing && latest?.status==='Awaiting review' && revision===null && !archived && <div className={styles.reviewer}><label htmlFor="review-feedback">Victoria’s feedback</label><textarea id="review-feedback" value={reviewNote} onChange={e=>setReviewNote(e.target.value)} placeholder="Acknowledge the work or explain what needs another pass."/><div><button className={styles.status} onClick={()=>review('Changes requested')}>Request changes</button><button className={styles.primary} onClick={()=>review('Reviewed')}>Mark reviewed</button></div></div>}
        {error&&<p role="alert" className={styles.formError}>{error}</p>}{message&&<p role="status" className={styles.submissionMeta}>{message}</p>}
        <div className={styles.reviewFooter}><span>{archived?'Sample historical submission. Read-only.':editing?'Draft in this preview. Submit even with unfinished work when you explain the blocker.':!latest?'Waiting for this coach’s submission.':'Submitted content is read-only. Requested changes create a new version.'}</span>{editing&&<button className={styles.primary} onClick={submit}>{latest?'Resubmit to Victoria':'Submit to Victoria'}</button>}</div>
      </div>
    </div>
    <div className={styles.footnote}>Simulation only: switching perspectives does not change your Tempo permissions. Submission, review, and history reset on reload.</div>
  </section>;
}
