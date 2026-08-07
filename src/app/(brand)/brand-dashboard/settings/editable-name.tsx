'use client';

import { useState, useTransition } from 'react';
import { Check, Pencil, X, Loader2 } from 'lucide-react';
import { updateBrandUserName } from '@/app/actions/brand-profile';

interface Props {
  initialName: string;
}

export function EditableName({ initialName }: Props) {
  const [name, setName] = useState(initialName);
  const [draft, setDraft] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startEdit() {
    setDraft(name);
    setErr(null);
    setEditing(true);
  }
  function cancel() {
    setDraft(name);
    setErr(null);
    setEditing(false);
  }
  function save() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setErr('Name cannot be empty.');
      return;
    }
    if (trimmed === name) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      try {
        const res = await updateBrandUserName(trimmed);
        setName(res.name);
        setEditing(false);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between px-5 py-3">
        <dt className="text-xs text-muted-foreground">Name</dt>
        <dd className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{name || '—'}</span>
          <button
            type="button"
            onClick={startEdit}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Edit name"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </dd>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-5 py-3 gap-3">
      <dt className="text-xs text-muted-foreground shrink-0">Name</dt>
      <dd className="flex items-center gap-2 flex-1 justify-end">
        <input
          autoFocus
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') cancel();
          }}
          maxLength={80}
          disabled={pending}
          className="flex-1 max-w-[260px] px-2.5 py-1.5 rounded-md border border-border text-sm bg-card focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]/50 transition-all disabled:opacity-60"
        />
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
          aria-label="Save"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </dd>
      {err && (
        <p className="absolute mt-12 text-xs text-rose-600 bg-rose-50 px-2 py-1 rounded-md shadow-sm">
          {err}
        </p>
      )}
    </div>
  );
}
