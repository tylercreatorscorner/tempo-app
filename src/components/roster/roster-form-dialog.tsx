'use client';

import { createContext, useContext, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertDialog, Dialog } from 'radix-ui';
import styles from './roster-form-dialog.module.css';

const CloseContext = createContext<(() => void) | null>(null);
export function RosterFormClose(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const close = useContext(CloseContext);
  if (!close) throw new Error('RosterFormClose requires RosterFormDialog');
  return <button {...props} type="button" onClick={close} />;
}

/** The roster's existing forms share keyboard, draft and focus behavior. */
export function RosterFormDialog({ title, description, children, onClose, busy, dirty, sheet = false, returnFocus }: {
  title: string; description: string; children: ReactNode;
  onClose: () => void; busy: boolean; dirty: boolean; sheet?: boolean; returnFocus?: () => void;
}) {
  const [discardOpen, setDiscardOpen] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(typeof document === 'undefined' ? null : document.activeElement as HTMLElement);
  const discardOpener = useRef<HTMLElement | null>(null);
  const discarded = useRef(false);
  const requestClose = () => {
    if (busy) return;
    if (!dirty) { onClose(); return; }
    discardOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    discarded.current = false;
    setDiscardOpen(true);
  };
  return <>
    <Dialog.Root open onOpenChange={open => { if (!open) requestClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content ref={content} className={`${styles.content} ${sheet ? styles.sheet : styles.modal}`} data-lenis-prevent
          onOpenAutoFocus={event => { event.preventDefault(); (content.current?.querySelector<HTMLInputElement>('input:not(:disabled), textarea:not(:disabled)') ?? content.current)?.focus({ preventScroll: true }); }}
          onEscapeKeyDown={event => { event.preventDefault(); requestClose(); }}
          onPointerDownOutside={event => { if (busy || dirty) { event.preventDefault(); requestClose(); } }}
          onCloseAutoFocus={event => { event.preventDefault(); if (opener.current?.isConnected) opener.current.focus({ preventScroll: true }); else returnFocus?.(); }}>
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <Dialog.Description className="sr-only">{description}</Dialog.Description>
          <CloseContext.Provider value={requestClose}>{children}</CloseContext.Provider>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <AlertDialog.Root open={discardOpen} onOpenChange={setDiscardOpen}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles.discardOverlay} />
        <AlertDialog.Content className={styles.discard} onCloseAutoFocus={event => { event.preventDefault(); if (!discarded.current && discardOpener.current?.isConnected) discardOpener.current.focus({ preventScroll: true }); }}>
          <AlertDialog.Title>Discard unsaved changes?</AlertDialog.Title>
          <AlertDialog.Description>Your changes have not been saved. Keep editing to finish, or discard this draft.</AlertDialog.Description>
          <div className={styles.actions}>
            <AlertDialog.Cancel>Keep editing</AlertDialog.Cancel>
            <AlertDialog.Action onClick={() => { discarded.current = true; onClose(); }}>Discard changes</AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  </>;
}
