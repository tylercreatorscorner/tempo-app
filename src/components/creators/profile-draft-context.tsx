'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface CoachingDraft { observation:string; experiment:string; followUp:string; }
interface DraftContext { drafts:Record<string,CoachingDraft>; update:(key:string,draft:CoachingDraft)=>void; }
const Context = createContext<DraftContext | null>(null);

/** Private in-memory drafts belong to this profile workspace and never cross a workspace switch. */
export function ProfileDraftProvider({children}:{children:ReactNode}) {
  const [drafts,setDrafts]=useState<Record<string,CoachingDraft>>({});
  useEffect(()=>{
    const clear=()=>setDrafts({});
    window.addEventListener('workspace-context-changed',clear);
    return()=>window.removeEventListener('workspace-context-changed',clear);
  },[]);
  const value=useMemo<DraftContext>(()=>({drafts,update:(key,draft)=>setDrafts(previous=>({...previous,[key]:draft}))}),[drafts]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useProfileDrafts(){return useContext(Context);}
