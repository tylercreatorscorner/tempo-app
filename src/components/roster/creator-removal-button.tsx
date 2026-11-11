'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertDialog } from 'radix-ui';
import { Loader2, Trash2 } from 'lucide-react';
import styles from './creator-removal.module.css';

type Props = {
  managedId: string | number;
  name: string;
  brand: string;
  brandLabel: string;
  disabled?: boolean;
  dirty?: boolean;
  className?: string;
  onRemoved?: () => void;
  onBusyChange?: (busy: boolean) => void;
};

/** Removes one brand's managed-roster relationship, never the creator identity. */
export function CreatorRemovalButton({ managedId, name, brand, brandLabel, disabled, dirty, className, onRemoved, onBusyChange }: Props) {
  const router = useRouter();
  const [permission, setPermission] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const requestGeneration = useRef(0);
  const busyChanged = useRef(onBusyChange);
  useEffect(() => { busyChanged.current = onBusyChange; }, [onBusyChange]);
  const scope = `${managedId}:${brand}:${generation}`;
  const canRemove = Boolean(brand && brand !== 'all' && /^\d+$/.test(String(managedId)) && permission === scope);

  useEffect(() => {
    const invalidate = () => { requestGeneration.current++; };
    const reset = () => {
      invalidate();
      pending.current = false;
      setBusy(false);
      busyChanged.current?.(false);
      setPermission(null);
      setOpen(false);
      setGeneration(value => value + 1);
    };
    window.addEventListener('workspace-context-changed', reset);
    return () => { invalidate(); window.removeEventListener('workspace-context-changed', reset); };
  }, [managedId, brand]);

  useEffect(() => {
    if (!brand || brand === 'all' || !/^\d+$/.test(String(managedId))) return;
    const controller = new AbortController();
    void fetch(`/api/roster/tags?brand=${encodeURIComponent(brand)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const data = await response.json();
        if (!controller.signal.aborted) setPermission(response.ok && data.canWrite === true ? scope : null);
      })
      .catch(() => { if (!controller.signal.aborted) setPermission(null); });
    return () => controller.abort();
  }, [brand, managedId, scope]);

  const remove = async () => {
    if (!canRemove || disabled || pending.current) return;
    pending.current = true;
    const started = requestGeneration.current;
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    try {
      const response = await fetch(`/api/roster/${encodeURIComponent(String(managedId))}?brand=${encodeURIComponent(brand)}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (started !== requestGeneration.current) return;
      if (!response.ok || data.ok !== true) throw new Error(data.error || 'Could not remove this creator. Please try again.');
      setOpen(false);
      if (onRemoved) onRemoved();
      else { router.push(`/roster?brand=${encodeURIComponent(brand)}`); router.refresh(); }
    } catch (failure) {
      if (started === requestGeneration.current) setError(failure instanceof Error ? failure.message : 'Could not remove this creator. Please try again.');
    } finally {
      if (started === requestGeneration.current) {
        pending.current = false;
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  };

  if (!canRemove) return null;
  return <AlertDialog.Root open={open} onOpenChange={next => { if (!pending.current) { setError(''); setOpen(next); } }}>
    <AlertDialog.Trigger asChild><button type="button" disabled={disabled || busy} className={`${styles.trigger} ${className ?? ''}`} title={`Remove creator from ${brandLabel}`}><Trash2 size={14} aria-hidden="true" />Remove creator</button></AlertDialog.Trigger>
    <AlertDialog.Portal>
      <AlertDialog.Overlay className={styles.overlay} />
      <AlertDialog.Content className={styles.dialog} aria-busy={busy} onEscapeKeyDown={event => { if (pending.current) event.preventDefault(); }}>
        <AlertDialog.Title>Remove {name} from {brandLabel}?</AlertDialog.Title>
        <AlertDialog.Description>
          This archives their {brandLabel} managed-roster record. Saved performance data and history are kept. Their creator account and relationships with other brands stay in place.
        </AlertDialog.Description>
        {dirty && <p className={styles.draft}>Unsaved edits in this form will be discarded if you remove the creator.</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <AlertDialog.Cancel disabled={busy}>Cancel</AlertDialog.Cancel>
          <button type="button" disabled={disabled || busy} className={styles.confirm} onClick={() => void remove()}>{busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}{busy ? 'Removing…' : 'Remove from roster'}</button>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>;
}
