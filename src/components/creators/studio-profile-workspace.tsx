'use client';

import { createContext, useCallback, useContext, useId, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import styles from './studio-profile.module.css';
import { ProfileDraftProvider } from './profile-draft-context';

type Review = 'delivery' | 'coaching';
type Section = { id: string; label: string; content: ReactNode };
type WorkspaceNavigation = {
  navigate: (section: string) => void;
  review: (review: Review, opener: HTMLButtonElement) => void;
};

const Navigation = createContext<WorkspaceNavigation | null>(null);

function useWorkspaceNavigation() {
  const value = useContext(Navigation);
  if (!value) throw new Error('Profile actions require CreatorProfileWorkspace.');
  return value;
}

export function ProfileWorkspaceLink({ section, children, className }: {
  section: string; children: ReactNode; className?: string;
}) {
  const { navigate } = useWorkspaceNavigation();
  return <button type="button" className={className ?? styles.textAction} onClick={() => navigate(section)}>{children}</button>;
}

export function ProfileReviewButton({ review, children, className }: {
  review: Review; children: ReactNode; className?: string;
}) {
  const navigation = useWorkspaceNavigation();
  const open = (event: MouseEvent<HTMLButtonElement>) => navigation.review(review, event.currentTarget);
  return <button type="button" aria-haspopup="dialog" className={className ?? styles.textAction} onClick={open}>{children}</button>;
}

/** Persistent context surrounds mounted work panels, so changing tabs keeps drafts intact. */
export function CreatorProfileWorkspace({ identity, headline, aside, sections, deliveryReview, coachingReview }: {
  identity: ReactNode; headline: ReactNode; aside: ReactNode; sections: Section[];
  deliveryReview: ReactNode; coachingReview: ReactNode;
}) {
  const [active, setActive] = useState(sections[0]?.id ?? 'overview');
  const [review, setReview] = useState<Review>('delivery');
  const [reviewOpen, setReviewOpen] = useState(false);
  const navigation = useRef<HTMLElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const navigateOnClose = useRef(false);
  const id = useId();
  const current = sections.some(section => section.id === active) ? active : sections[0]?.id;

  const focusSection = useCallback((section: string, scroll: boolean) => {
    requestAnimationFrame(() => {
      const button = navigation.current?.querySelector<HTMLButtonElement>(`[data-section="${section}"]`);
      button?.focus({ preventScroll: true });
      if (scroll && anchor.current) {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        anchor.current.scrollIntoView({ block: 'start', behavior: reduced ? 'instant' : 'smooth' });
      }
    });
  }, []);

  const activate = useCallback((section: string, fromLink = false) => {
    if (!sections.some(item => item.id === section)) return;
    setActive(section);
    if (fromLink) {
      navigateOnClose.current = true;
      setReviewOpen(false);
      focusSection(section, true);
    }
  }, [sections, focusSection]);

  const openReview = useCallback((next: Review, button: HTMLButtonElement) => {
    opener.current = button;
    navigateOnClose.current = false;
    setReview(next);
    setReviewOpen(true);
  }, []);
  const context = useMemo<WorkspaceNavigation>(() => ({
    navigate: section => activate(section, true), review: openReview,
  }), [activate, openReview]);
  const title = review === 'delivery' ? 'Delivery evidence' : 'Coaching review';

  return <ProfileDraftProvider><Navigation.Provider value={context}>
    <div className={styles.workspace}>
      <div className={styles.identitySlot} role="region" aria-label="Creator information and controls" tabIndex={0}>{identity}</div>
      <div className={styles.workbench}>
        <div className={styles.headlineSlot}>{headline}</div>
        <div className={styles.sectionAnchor} ref={anchor} aria-hidden="true" />
        <nav ref={navigation} className={styles.tabs} role="tablist" aria-label="Creator profile sections">
          {sections.map((section, index) => <button
            key={section.id} type="button" role="tab" data-section={section.id}
            id={`${id}-${section.id}-tab`} aria-controls={`${id}-${section.id}-panel`}
            aria-selected={current === section.id} tabIndex={current === section.id ? 0 : -1}
            onClick={() => activate(section.id)}
            onKeyDown={event => {
              if (event.altKey || event.ctrlKey || event.metaKey) return;
              const nextIndex = event.key === 'ArrowRight' ? (index + 1) % sections.length
                : event.key === 'ArrowLeft' ? (index - 1 + sections.length) % sections.length
                  : event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : null;
              if (nextIndex === null) return;
              event.preventDefault();
              activate(sections[nextIndex].id);
              focusSection(sections[nextIndex].id, false);
            }}
          >{section.label}</button>)}
        </nav>
        <div className={styles.sectionStage}>
          {sections.map(section => <div
            key={section.id} className={styles.sectionPanel} role="tabpanel" tabIndex={0}
            id={`${id}-${section.id}-panel`} aria-labelledby={`${id}-${section.id}-tab`}
            hidden={current !== section.id}
          >{section.content}</div>)}
        </div>
      </div>
      <aside className={styles.asideSlot} aria-label="Creator action context">{aside}</aside>
    </div>
    <Dialog.Root open={reviewOpen} onOpenChange={setReviewOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.reviewOverlay} />
        <Dialog.Content className={styles.reviewDrawer} data-lenis-prevent onCloseAutoFocus={event => {
          event.preventDefault();
          if (!navigateOnClose.current && opener.current?.isConnected) opener.current.focus({ preventScroll: true });
        }}>
          <header className={styles.reviewHeader}>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className={styles.reviewClose} aria-label={`Close ${title.toLowerCase()}`}><X size={18} aria-hidden="true" /></Dialog.Close>
          </header>
          <Dialog.Description className="sr-only">{review === 'delivery' ? 'Recorded publications and agreement context for this creator.' : 'Saved context for the next coaching conversation.'}</Dialog.Description>
          <div className={styles.reviewContent}>{review === 'delivery' ? deliveryReview : coachingReview}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </Navigation.Provider></ProfileDraftProvider>;
}
