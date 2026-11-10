'use client';

import { useId, useState } from 'react';
import { useProfileDrafts, type CoachingDraft } from './profile-draft-context';

/** A private, unsaved working brief; copying never sends to Discord. */
export function CoachingBrief({ creator, brand, draftKey }: { creator: string; brand: string; draftKey?:string }) {
  const id = useId();
  const drafts=useProfileDrafts();
  const [local,setLocal]=useState<CoachingDraft>({observation:'',experiment:'',followUp:''});
  const draft=draftKey&&drafts?drafts.drafts[draftKey]??{observation:'',experiment:'',followUp:''}:local;
  const {observation,experiment,followUp}=draft;
  const update=(field:keyof CoachingDraft,value:string)=>{const next={...draft,[field]:value};if(draftKey&&drafts)drafts.update(draftKey,next);else setLocal(next);};
  const setObservation=(value:string)=>update('observation',value);
  const setExperiment=(value:string)=>update('experiment',value);
  const setFollowUp=(value:string)=>update('followUp',value);
  const [message, setMessage] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${creator} · ${brand}\nObservation: ${observation}\nNext experiment: ${experiment}\nFollow-up: ${followUp || 'To agree'}`);
      setMessage('Copied. Review the audience before sharing.');
    } catch { setMessage('Clipboard unavailable. Select and copy the text manually.'); }
  }
  return <details className="mt-4 border-t border-border pt-3">
    <summary className="cursor-pointer text-sm font-medium">Prepare coaching brief</summary>
    <p className="text-xs text-muted-foreground">Unsaved draft · stays on this page. Nothing is sent to Discord.</p>
    <div className="mt-3 space-y-3">
      <label htmlFor={`${id}-observation`} className="block text-xs">Video / observation<textarea id={`${id}-observation`} value={observation} onChange={e=>setObservation(e.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-input bg-background p-2" /></label>
      <label htmlFor={`${id}-experiment`} className="block text-xs">Next experiment<textarea id={`${id}-experiment`} value={experiment} onChange={e=>setExperiment(e.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-input bg-background p-2" /></label>
      <label htmlFor={`${id}-followup`} className="block text-xs">Follow-up / owner<input id={`${id}-followup`} value={followUp} onChange={e=>setFollowUp(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background p-2" /></label>
      <button type="button" disabled={!observation.trim() || !experiment.trim()} onClick={copy} className="rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-40">Copy brief</button>
      <p role="status" className="text-xs">{message}</p>
    </div>
  </details>;
}
