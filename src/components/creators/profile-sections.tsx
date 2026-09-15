'use client';

import { createContext, useContext, useId, useRef, useState, type ReactNode } from 'react';
import styles from './profile-workspace.module.css';
import { useSmoothScroll } from '@/components/providers/lenis-provider';

const SectionNavigation = createContext<(section: string) => void>(() => {});
export function ProfileSectionLink({ section, children }: { section: string; children: ReactNode }) {
  const navigate = useContext(SectionNavigation);
  return <button type="button" className={styles.textAction} onClick={() => navigate(section)}>{children} <span aria-hidden="true">→</span></button>;
}

export function ProfileSections({ sections }: { sections: { id: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(sections[0].id);
  const id = useId();
  const navigation = useRef<HTMLElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const scrollTo = useSmoothScroll();
  function activate(next: string) {
    if (next === active) return;
    setActive(next);
    const nav = navigation.current;
    if (nav && nav.getBoundingClientRect().top < 58) {
      // A sticky element's viewport position is not its original document position.
      // Target the stationary anchor after the panel height has changed.
      requestAnimationFrame(() => { if (anchor.current) scrollTo(anchor.current, -56); });
    }
  }
  return <SectionNavigation.Provider value={next => {
    activate(next);
    requestAnimationFrame(() => navigation.current?.querySelector<HTMLButtonElement>(`[id="${id}-${next}-tab"]`)?.focus({preventScroll:true}));
  }}>
    <div ref={anchor} className={styles.sectionAnchor} aria-hidden="true" />
    <nav ref={navigation} className={styles.tabs} aria-label="Creator profile sections" role="tablist">
      {sections.map((section, index) => <button type="button" role="tab" key={section.id} id={`${id}-${section.id}-tab`} aria-controls={`${id}-${section.id}-panel`} aria-selected={active === section.id} tabIndex={active === section.id ? 0 : -1} onClick={() => activate(section.id)} onKeyDown={event => {
        const nextIndex = event.key === 'ArrowRight' ? (index + 1) % sections.length : event.key === 'ArrowLeft' ? (index - 1 + sections.length) % sections.length : event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : null;
        if (nextIndex === null) return;
        event.preventDefault();
        activate(sections[nextIndex].id);
        navigation.current?.querySelectorAll<HTMLButtonElement>('button')[nextIndex]?.focus({ preventScroll: true });
      }}>{section.label}</button>)}
    </nav>
    <div className={styles.sectionStage}>{sections.map(section => <div className={styles.sectionPanel} role="tabpanel" id={`${id}-${section.id}-panel`} aria-labelledby={`${id}-${section.id}-tab`} tabIndex={0} key={section.id} hidden={active !== section.id}>{section.content}</div>)}</div>
  </SectionNavigation.Provider>;
}
