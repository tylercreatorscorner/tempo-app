'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Loader2, X } from 'lucide-react';
import { updateMemberName } from '@/app/actions/users';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { Input } from '@/components/ui/input';

export function EditMemberProfile({ member, onClose, onSaved }: {
  member: { user_id: string; name: string | null; email: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(member.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const panel = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => previous?.focus();
  }, []);
  const close = () => { if (!pending) onClose(); };
  const unchanged = name.trim() === (member.name ?? '');

  return (
    <ModalOverlay onClose={close} closeOnBackdropClick={false} closeOnEsc={!pending}>
      <div className="fixed inset-0 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]" onClick={close}>
        <form ref={panel} role="dialog" aria-modal="true" aria-labelledby="edit-member-title"
          aria-describedby="edit-member-description" aria-busy={pending}
          className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-xl"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key !== 'Tab') return;
            const nodes = panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])');
            if (!nodes?.length) return;
            const first = nodes[0], last = nodes[nodes.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
          }}
          onSubmit={(event) => {
            event.preventDefault();
            if (pending || unchanged || !name.trim()) return;
            setError(null);
            startTransition(async () => {
              try {
                const result = await updateMemberName(member.user_id, name);
                if (!result.ok) { setError(result.error); return; }
                onSaved();
              } catch { setError('Could not connect. Try saving again.'); }
            });
          }}>
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 id="edit-member-title" className="text-sm font-semibold">Edit profile</h2>
            <button type="button" onClick={close} disabled={pending} aria-label="Close profile editor" className="rounded-md p-2 text-muted-foreground hover:bg-secondary disabled:opacity-50"><X className="h-4 w-4" /></button>
          </header>
          <div className="space-y-4 bg-secondary/20 p-4">
            <p id="edit-member-description" className="text-xs text-muted-foreground">Update how this member’s name appears in Tempo.</p>
            {error && <p role="alert" className="rounded-md bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
            <div>
              <label htmlFor="member-name" className="mb-1.5 block text-xs font-medium">Display name</label>
              <Input id="member-name" autoFocus required maxLength={100} autoComplete="off" value={name} disabled={pending} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="min-w-0">
              <span className="block text-xs font-medium">Sign-in email</span>
              <p className="mt-1 break-all text-sm text-muted-foreground">{member.email}</p>
              <p className="mt-1 text-xs text-muted-foreground">Email changes require a separate verification step.</p>
            </div>
          </div>
          <footer className="flex justify-end gap-2 border-t border-border px-4 py-3">
            <button type="button" onClick={close} disabled={pending} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={pending || unchanged || !name.trim()} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}{pending ? 'Saving…' : 'Save name'}
            </button>
          </footer>
        </form>
      </div>
    </ModalOverlay>
  );
}
